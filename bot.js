require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const chrono = require('chrono-node');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = String(process.env.OWNER_CHAT_ID);
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

if (!TOKEN || !OWNER_CHAT_ID) {
  console.error('ERROR: Define TELEGRAM_BOT_TOKEN y OWNER_CHAT_ID en el archivo .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ─── Persistencia ──────────────────────────────────────────────────────────
function loadReminders() {
  try {
    const raw = fs.readFileSync(REMINDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function nextId(reminders) {
  if (reminders.length === 0) return 1;
  return Math.max(...reminders.map((r) => r.id)) + 1;
}

// ─── Guard: solo el dueño puede usar el bot ────────────────────────────────
bot.use((ctx, next) => {
  if (String(ctx.chat?.id) !== OWNER_CHAT_ID) return;
  return next();
});

// ─── Parseo de fecha con chrono-node en español ────────────────────────────
const chronoEs = chrono.casual;

function parseFecha(texto) {
  // chrono-node soporta español de forma nativa en v2
  const resultado = chronoEs.parse(texto, new Date(), { forwardDate: true });
  if (resultado.length === 0) return null;
  return resultado[0].date();
}

// Extrae la parte de fecha del texto del recordatorio.
// Estrategia: intenta parsear desde la última "palabra clave temporal" hallada.
function separateTextoFecha(input) {
  const triggers = [
    'mañana', 'hoy', 'lunes', 'martes', 'miércoles', 'miercoles',
    'jueves', 'viernes', 'sábado', 'sabado', 'domingo',
    'en ', 'a las', 'el ', 'próximo', 'proximo', 'esta ',
    'este ', 'siguiente', 'pasado',
  ];

  let bestIdx = -1;
  for (const t of triggers) {
    const idx = input.toLowerCase().lastIndexOf(t);
    if (idx !== -1 && idx > bestIdx) bestIdx = idx;
  }

  if (bestIdx === -1) {
    // Sin marcador temporal: intentar parsear el texto completo
    const fecha = parseFecha(input);
    return fecha ? { texto: input.trim(), fecha } : null;
  }

  const textoStr = input.slice(0, bestIdx).trim();
  const fechaStr = input.slice(bestIdx).trim();
  const fecha = parseFecha(fechaStr) || parseFecha(input);

  if (!fecha) return null;
  return { texto: textoStr || input.trim(), fecha };
}

function formatFecha(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Notificación de recordatorio ─────────────────────────────────────────
async function notificarRecordatorio(reminder) {
  const msg =
    `⏰ *Recordatorio #${reminder.id}*\n` +
    `📝 ${reminder.texto}\n\n` +
    `¿Lo completaste?\n` +
    `  ✅ /listo\\_${reminder.id}\n` +
    `  ⏩ /posponer\\_${reminder.id} 30`;
  await bot.telegram.sendMessage(OWNER_CHAT_ID, msg, { parse_mode: 'Markdown' });
}

// ─── Cron: revisar cada minuto ─────────────────────────────────────────────
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const reminders = loadReminders();
  let changed = false;

  for (const r of reminders) {
    if (r.completado) continue;
    const fechaReminder = new Date(r.fecha_iso);
    // Disparar si ya pasó la hora (dentro del último minuto)
    if (fechaReminder <= now && !r.disparado) {
      r.disparado = true;
      changed = true;
      try {
        await notificarRecordatorio(r);
      } catch (e) {
        console.error('Error enviando notificación:', e.message);
      }
    }
  }

  if (changed) saveReminders(reminders);
});

// ─── /recordar ─────────────────────────────────────────────────────────────
bot.command('recordar', async (ctx) => {
  const input = ctx.message.text.replace(/^\/recordar\s*/i, '').trim();

  if (!input) {
    return ctx.reply(
      '📝 Uso: /recordar [texto] [fecha/hora]\n' +
      'Ejemplo: /recordar llamar a Carolayn mañana a las 3pm'
    );
  }

  const parsed = separateTextoFecha(input);

  if (!parsed) {
    return ctx.reply(
      '❌ No pude entender la fecha. Intenta con:\n' +
      '"mañana a las 3pm", "el lunes a las 10", "en 2 horas", etc.'
    );
  }

  const reminders = loadReminders();
  const nuevo = {
    id: nextId(reminders),
    texto: parsed.texto,
    fecha_iso: parsed.fecha.toISOString(),
    completado: false,
    disparado: false,
  };
  reminders.push(nuevo);
  saveReminders(reminders);

  await ctx.reply(
    `✅ Recordatorio #${nuevo.id} guardado:\n` +
    `📝 ${nuevo.texto}\n` +
    `📅 ${formatFecha(nuevo.fecha_iso)}`
  );
});

// ─── /agenda ───────────────────────────────────────────────────────────────
bot.command('agenda', async (ctx) => {
  const reminders = loadReminders().filter((r) => !r.completado);

  if (reminders.length === 0) {
    return ctx.reply('📭 No tienes recordatorios pendientes.');
  }

  reminders.sort((a, b) => new Date(a.fecha_iso) - new Date(b.fecha_iso));

  const lines = reminders.map(
    (r) => `#${r.id} — ${r.texto}\n    📅 ${formatFecha(r.fecha_iso)}`
  );

  await ctx.reply(`📋 *Agenda pendiente:*\n\n${lines.join('\n\n')}`, {
    parse_mode: 'Markdown',
  });
});

// ─── /hoy ──────────────────────────────────────────────────────────────────
bot.command('hoy', async (ctx) => {
  const hoy = new Date();
  const reminders = loadReminders().filter((r) => {
    if (r.completado) return false;
    const f = new Date(r.fecha_iso);
    return (
      f.getFullYear() === hoy.getFullYear() &&
      f.getMonth() === hoy.getMonth() &&
      f.getDate() === hoy.getDate()
    );
  });

  if (reminders.length === 0) {
    return ctx.reply('🎉 No tienes recordatorios para hoy.');
  }

  reminders.sort((a, b) => new Date(a.fecha_iso) - new Date(b.fecha_iso));

  const lines = reminders.map(
    (r) => `#${r.id} — ${r.texto}\n    🕐 ${formatFecha(r.fecha_iso)}`
  );

  await ctx.reply(`📅 *Recordatorios de hoy:*\n\n${lines.join('\n\n')}`, {
    parse_mode: 'Markdown',
  });
});

// ─── /borrar ───────────────────────────────────────────────────────────────
bot.command('borrar', async (ctx) => {
  const args = ctx.message.text.split(/\s+/);
  const id = parseInt(args[1]);

  if (isNaN(id)) {
    return ctx.reply('❌ Uso: /borrar [id]\nEjemplo: /borrar 3');
  }

  let reminders = loadReminders();
  const idx = reminders.findIndex((r) => r.id === id);

  if (idx === -1) {
    return ctx.reply(`❌ No existe el recordatorio #${id}.`);
  }

  const borrado = reminders[idx];
  reminders.splice(idx, 1);
  saveReminders(reminders);

  await ctx.reply(`🗑️ Recordatorio #${id} eliminado: "${borrado.texto}"`);
});

// ─── /listo_N (acepta /listo_3 o /listo 3) ────────────────────────────────
bot.hears(/^\/listo[_ ](\d+)/i, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const reminders = loadReminders();
  const r = reminders.find((r) => r.id === id);

  if (!r) return ctx.reply(`❌ No existe el recordatorio #${id}.`);
  if (r.completado) return ctx.reply(`✅ El recordatorio #${id} ya estaba completado.`);

  r.completado = true;
  saveReminders(reminders);

  await ctx.reply(`✅ ¡Listo! Recordatorio #${id} marcado como completado.\n"${r.texto}"`);
});

// ─── /posponer_N M (acepta /posponer_3 30 o /posponer 3 30) ───────────────
bot.hears(/^\/posponer[_ ](\d+)(?:\s+(\d+))?/i, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const minutos = parseInt(ctx.match[2] ?? '30');

  const reminders = loadReminders();
  const r = reminders.find((r) => r.id === id);

  if (!r) return ctx.reply(`❌ No existe el recordatorio #${id}.`);
  if (r.completado) return ctx.reply(`❌ El recordatorio #${id} ya está completado.`);

  const nuevaFecha = new Date(new Date(r.fecha_iso).getTime() + minutos * 60 * 1000);
  r.fecha_iso = nuevaFecha.toISOString();
  r.disparado = false; // permitir que vuelva a dispararse
  saveReminders(reminders);

  await ctx.reply(
    `⏩ Recordatorio #${id} pospuesto ${minutos} min.\n` +
    `📅 Nueva hora: ${formatFecha(r.fecha_iso)}`
  );
});

// ─── /start / /help ────────────────────────────────────────────────────────
bot.command(['start', 'help'], async (ctx) => {
  await ctx.reply(
    `🤖 *Bot de Recordatorios*\n\n` +
    `*Comandos disponibles:*\n\n` +
    `/recordar [texto] [fecha] — Agrega un recordatorio\n` +
    `  _Ej: /recordar llamar a Carolayn mañana a las 3pm_\n\n` +
    `/agenda — Lista todos los pendientes\n\n` +
    `/hoy — Muestra solo los de hoy\n\n` +
    `/borrar [id] — Elimina un recordatorio\n` +
    `  _Ej: /borrar 3_\n\n` +
    `/listo [id] — Marca como completado\n` +
    `  _Ej: /listo 2_\n\n` +
    `/posponer [id] [minutos] — Reprograma N minutos adelante\n` +
    `  _Ej: /posponer 2 30_`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Arranque ───────────────────────────────────────────────────────────────
async function main() {
  // Reactivar recordatorios pendientes al iniciar
  const reminders = loadReminders();
  const pendientes = reminders.filter((r) => !r.completado && !r.disparado);
  console.log(`✅ ${pendientes.length} recordatorio(s) pendiente(s) cargados.`);

  bot.launch();
  console.log('🤖 Bot iniciado. Esperando mensajes...');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Error al iniciar el bot:', err);
  process.exit(1);
});
