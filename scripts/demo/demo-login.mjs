import http from "node:http";

import {
  createDemoAdminClient,
  DEMO_OWNER_EMAIL,
  getDemoContext,
} from "./demo-helpers.mjs";

const HOST = "127.0.0.1";
const PORT = 3417;
const APP_URL = process.env.COPPE_DEMO_APP_URL ?? "http://localhost:3000";
const CALLBACK_URL = `${APP_URL.replace(/\/$/, "")}/demo/acceso`;
const admin = createDemoAdminClient();

async function createLoginLink() {
  await getDemoContext(admin);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_OWNER_EMAIL,
    options: {
      redirectTo: CALLBACK_URL,
    },
  });

    if (error || !data.properties?.hashed_token) {
      throw new Error(
        `No se pudo generar el acceso: ${error?.message ?? "respuesta vacía"}`
      );
    }

    return `${APP_URL.replace(
      /\/$/,
      ""
    )}/api/demo-session?token_hash=${encodeURIComponent(
      data.properties.hashed_token
    )}`;
}

const server = http.createServer(async (request, response) => {
  if (request.url !== "/") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Ruta no encontrada.");
    return;
  }

  try {
    const actionLink = await createLoginLink();

    response.writeHead(302, {
      "cache-control": "no-store",
      location: actionLink,
    });
    response.end();

    setTimeout(() => server.close(), 1_000);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(
      `No se pudo abrir la sesión demo: ${
        error instanceof Error ? error.message : "error desconocido"
      }`
    );
    server.close();
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    [
      "Acceso local de un solo uso preparado.",
      `1. Comprueba que COPPE está abierto en ${APP_URL}`,
      `2. Abre http://${HOST}:${PORT}`,
      "El enlace caduca al utilizarse y el servidor local se cerrará.",
    ].join("\n")
  );
});

setTimeout(() => {
  server.close();
}, 5 * 60 * 1_000);
