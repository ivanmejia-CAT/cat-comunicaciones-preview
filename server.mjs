import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
loadEnv();

const port = Number(process.env.PORT || 3000);
const googleAuth = new OAuth2Client();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (process.env.NODE_ENV === 'production' && !authorizePreview(req, res)) return;

  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, { googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await authenticatedUser(req, res);
    if (user) sendJson(res, 200, user);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    await getProjects(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/requests') {
    await createRequest(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Método no permitido.' });
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = resolve(here, `.${requestedPath}`);
  if (filePath !== here && !filePath.startsWith(`${here}${sep}`)) {
    sendJson(res, 404, { error: 'No encontrado.' });
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    sendJson(res, 404, { error: 'No encontrado.' });
  }
});

// Cloud Run injects PORT and routes traffic to the container interface.
server.listen(port, '0.0.0.0', () => {
  console.log(`Portal CAT disponible en http://localhost:${port}`);
});

function authorizePreview(req, res) {
  const expectedPassword = process.env.PREVIEW_ACCESS_PASSWORD || '';
  if (!expectedPassword) {
    sendJson(res, 503, { error: 'El acceso protegido de la vista previa no está configurado.' });
    return false;
  }

  const header = req.headers.authorization || '';
  let username = '';
  let password = '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator >= 0) {
        username = decoded.slice(0, separator);
        password = decoded.slice(separator + 1);
      }
    } catch {
      // Invalid credentials are rejected below.
    }
  }

  if (safeEqual(username, process.env.PREVIEW_ACCESS_USER || 'cat') && safeEqual(password, expectedPassword)) return true;
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="CAT Comunicaciones · Vista previa", charset="UTF-8"',
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Introduce el usuario y contraseña de la vista previa del portal CAT.');
  return false;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function createRequest(req, res) {
  const user = await authenticatedUser(req, res);
  if (!user) return;

  const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID } = process.env;
  if (!TRELLO_API_KEY || !TRELLO_TOKEN || !TRELLO_LIST_ID) {
    sendJson(res, 503, { error: 'Falta configurar Trello en el archivo .env del servidor.' });
    return;
  }

  let requestData;
  try {
    requestData = await readJson(req);
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message });
    return;
  }

  const validationError = validateRequest({ ...requestData, requesterName: user.name, requesterEmail: user.email });
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  requestData.requesterName = user.name || user.email;
  requestData.requesterEmail = user.email;
  const cardName = clean(requestData.projectTitle, 100);
  const cardDescription = buildDescription(requestData);
  const body = new URLSearchParams({
    idList: TRELLO_LIST_ID,
    name: cardName,
    desc: cardDescription,
  });

  try {
    const trelloResponse = await fetch('https://api.trello.com/1/cards', {
      method: 'POST',
      headers: trelloHeaders(TRELLO_API_KEY, TRELLO_TOKEN, 'application/x-www-form-urlencoded'),
      body,
      signal: AbortSignal.timeout(15000),
    });
    const result = await trelloResponse.json().catch(() => ({}));
    if (!trelloResponse.ok) {
      console.error(`Trello rechazó una solicitud (${trelloResponse.status}).`);
      const message = trelloResponse.status === 401 || trelloResponse.status === 403
        ? 'Trello rechazó la autorización. Revisa que el token siga vigente y tenga permiso de escritura.'
        : 'Trello no pudo crear la tarjeta. Revisa la configuración e inténtalo de nuevo.';
      sendJson(res, 502, { error: message });
      return;
    }

    sendJson(res, 201, { card: { id: result.id, name: result.name, url: result.url } });
  } catch (error) {
    console.error('No se pudo conectar con Trello:', error.name || 'Error');
    sendJson(res, 502, { error: 'No se pudo conectar con Trello. Inténtalo de nuevo en un momento.' });
  }
}

async function getProjects(req, res) {
  const user = await authenticatedUser(req, res);
  if (!user) return;
  const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;
  if (!TRELLO_API_KEY || !TRELLO_TOKEN || !TRELLO_BOARD_ID) {
    sendJson(res, 503, { error: 'Falta configurar Trello en el archivo .env del servidor.' });
    return;
  }

  try {
    const [cardsResponse, listsResponse] = await Promise.all([
      fetch(`https://api.trello.com/1/boards/${encodeURIComponent(TRELLO_BOARD_ID)}/cards?fields=id,name,desc,url,idList,dateLastActivity`, {
        headers: trelloHeaders(TRELLO_API_KEY, TRELLO_TOKEN), signal: AbortSignal.timeout(15000),
      }),
      fetch(`https://api.trello.com/1/boards/${encodeURIComponent(TRELLO_BOARD_ID)}/lists?filter=open&fields=id,name`, {
        headers: trelloHeaders(TRELLO_API_KEY, TRELLO_TOKEN), signal: AbortSignal.timeout(15000),
      }),
    ]);
    if (!cardsResponse.ok || !listsResponse.ok) {
      console.error(`Trello rechazó la consulta de proyectos (${cardsResponse.status}/${listsResponse.status}).`);
      sendJson(res, 502, { error: 'No se pudieron consultar los proyectos en Trello.' });
      return;
    }
    const [cards, lists] = await Promise.all([cardsResponse.json(), listsResponse.json()]);
    const listNames = new Map(lists.map((list) => [list.id, list.name]));
    const emailNeedle = user.email.toLowerCase();
    const ownCards = cards.filter((card) => {
      const match = String(card.desc || '').match(/^Correo CAT:\s*(.+)$/im);
      return match && match[1].trim().toLowerCase() === emailNeedle;
    }).map((card) => {
      const listName = listNames.get(card.idList) || 'Sin estado';
      const stage = projectStage(listName);
      return {
        id: card.id,
        title: card.name,
        type: 'Solicitud de Comunicaciones',
        status: stage.label,
        tone: stage.index === 1 ? 'warning' : stage.index === 2 ? 'progress' : stage.index === 3 ? 'review' : '',
        date: card.dateLastActivity ? `Actualizado · ${card.dateLastActivity.slice(0, 10)}` : 'Actualizado recientemente',
        url: card.url,
        progress: stage.index,
      };
    });
    sendJson(res, 200, { projects: ownCards });
  } catch (error) {
    console.error('No se pudo consultar Trello:', error.name || 'Error');
    sendJson(res, 502, { error: 'No se pudo conectar con Trello. Inténtalo de nuevo en un momento.' });
  }
}

async function authenticatedUser(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    sendJson(res, 503, { error: 'Falta configurar el inicio de sesión de Google Workspace en .env.' });
    return null;
  }
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    sendJson(res, 401, { error: 'Inicia sesión con tu cuenta Google del CAT para continuar.' });
    return null;
  }
  try {
    const ticket = await googleAuth.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = String(payload?.email || '').toLowerCase();
    if (!payload || payload.hd?.toLowerCase() !== 'cat.mx' || !email.endsWith('@cat.mx') || payload.email_verified !== true) {
      sendJson(res, 403, { error: 'Usa una cuenta verificada de Google Workspace @cat.mx.' });
      return null;
    }
    return { email, name: payload.name || email, picture: payload.picture || '' };
  } catch {
    sendJson(res, 401, { error: 'La sesión de Google expiró. Inicia sesión nuevamente.' });
    return null;
  }
}

function trelloHeaders(apiKey, token, contentType) {
  const headers = {
    Authorization: `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`,
    Accept: 'application/json',
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function projectStage(listName) {
  const normalized = String(listName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const stages = [
    { match: 'nuevas solicitudes', label: 'Recibida' },
    { match: 'falta informacion', label: 'Falta información' },
    { match: 'en produccion', label: 'En producción' },
    { match: 'en revision', label: 'En revisión' },
    { match: 'entregadas', label: 'Entregadas' },
  ];
  const index = stages.findIndex((stage) => stage.match === normalized);
  return index < 0 ? { label: listName, index: null } : { label: stages[index].label, index };
}

function validateRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'La solicitud no tiene un formato válido.';
  const required = ['service', 'projectTitle', 'requesterName', 'requesterEmail', 'verifiedBy', 'neededBy', 'details'];
  if (required.some((field) => !String(data[field] || '').trim())) return 'Completa todos los campos obligatorios.';
  if (data.confirmed !== true) return 'Confirma que la información está completa y verificada.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.requesterEmail))) return 'Escribe un correo electrónico válido.';
  if (!['Publicación en redes', 'Cobertura de evento', 'Diseño y branding', 'Otro / No estoy seguro'].includes(data.service)) return 'Selecciona un tipo de servicio válido.';
  if (data.service === 'Publicación en redes' && ['publishDate', 'channel', 'postCopy'].some((key) => !String(data[key] || '').trim())) return 'Completa los datos de la publicación.';
  if (data.service === 'Cobertura de evento' && ['eventDate', 'eventTime', 'eventPlace', 'eventContact'].some((key) => !String(data[key] || '').trim())) return 'Completa los datos de la cobertura del evento.';
  if (data.service === 'Diseño y branding' && !String(data.designType || '').trim()) return 'Selecciona el tipo de pieza de diseño.';
  if (data.service === 'Otro / No estoy seguro' && !String(data.otherType || '').trim()) return 'Describe qué necesitas.';
  if (data.materialsUrl && !isHttpUrl(data.materialsUrl)) return 'El enlace a materiales debe comenzar con https:// o http://.';
  return null;
}

function buildDescription(data) {
  const lines = [
    'SOLICITUD DE TRABAJO · CAT COMUNICACIONES',
    '',
    `Servicio: ${clean(data.service, 100)}`,
    `Solicitante: ${clean(data.requesterName, 120)}`,
    `Correo CAT: ${clean(data.requesterEmail, 180)}`,
    `Información verificada por: ${clean(data.verifiedBy, 120)}`,
    `Fecha requerida: ${clean(data.neededBy, 30)}`,
    '',
    'DETALLES',
    clean(data.details, 5000),
  ];

  const detailsByService = {
    'Publicación en redes': [
      ['Fecha de publicación deseada', data.publishDate], ['Canal', data.channel], ['Texto / información', data.postCopy],
    ],
    'Cobertura de evento': [
      ['Fecha del evento', data.eventDate], ['Hora de inicio', data.eventTime], ['Lugar', data.eventPlace], ['Responsable en el evento', data.eventContact],
    ],
    'Diseño y branding': [
      ['Pieza solicitada', data.designType], ['Medidas / formato', data.dimensions],
    ],
    'Otro / No estoy seguro': [['Necesidad', data.otherType]],
  };

  for (const [label, value] of detailsByService[data.service] || []) {
    if (value) lines.push(`${label}: ${clean(value, 2000)}`);
  }
  if (data.materialsUrl) lines.push('', `Materiales: ${clean(data.materialsUrl, 1000)}`);
  lines.push('', 'La información fue confirmada por quien solicita y verificada por la persona indicada.');
  return lines.join('\n');
}

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        const error = new Error('La solicitud es demasiado grande.');
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('No se pudo leer la información del formulario.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function loadEnv() {
  const envPath = resolve(here, '.env');
  try {
    // Read only local development settings; deployment environments can inject process.env directly.
    const source = requireEnvFile(envPath);
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function requireEnvFile(path) {
  // Synchronous read is acceptable once at process startup.
  return readFileSync(path, 'utf8');
}
