# agent-org

Una empresa de agentes: se arma el organigrama, se le conectan las fuentes de
datos de la compañía y se le hacen preguntas que contesta con los registros
adentro, no con lo que se acuerda.

## Levantarlo en un servidor

Hace falta Docker y nada más.

```bash
git clone <este-repo> agent-org && cd agent-org
cp .env.example .env      # y poné tu DEEPSEEK_API_KEY adentro
docker compose up -d
```

Abrí `http://localhost:3100`. Si el servidor es remoto, es el puerto 3100 de esa
máquina.

Para moverlo de puerto, `PORT=8080 docker compose up -d`.

### Detrás de un proxy con TLS

Autorizar una fuente manda el navegador afuera y lo hace volver, así que hay que
decirle con qué nombre vuelve:

```bash
APP_ORIGIN=https://agentes.tuempresa.com docker compose up -d
```

Lo que sea que esté adelante tiene que pasar `X-Forwarded-Host` y no bufferear
las respuestas: la aplicación manda eventos a medida que pasan y un proxy que
los junta hace que la pantalla se quede quieta hasta el final. En nginx,
`proxy_buffering off;`.

### Los datos

Todo lo que la empresa tiene — el organigrama, los hilos, la biblioteca y las
fuentes — vive en un volumen llamado `datos`, montado en `/app/.data`. La imagen
se puede tirar y rehacer; eso no.

```bash
# copia de seguridad
docker compose exec agent-org tar -cz -C /app/.data . > respaldo.tgz
```

## Levantarlo sin Docker

Node 20 o más nuevo. Python 3 es opcional: sin él los agentes contestan igual,
pero no pueden calcular nada sobre lo que trajeron.

```bash
npm install
cp .env.example .env
npm run dev     # las tres partes a la vez, en http://localhost:3100
```

Para producción, `npm run build && npm start`.

El sandbox de Python solo se ofrece donde se le puede sacar la red y el disco:
en macOS con `sandbox-exec`, que ya viene, y en Linux con `bubblewrap`
(`apt install bubblewrap`). En cualquier otro lado la herramienta directamente no
aparece — nunca se corre un script sin encierro.

## Cómo está partido

```
apps/web       la pantalla (Next.js). Le pasa /api/... al server.
apps/server    la API (Express). Todo lo que piensa y todo lo que guarda.
packages/shared  los tipos que los dos necesitan entender igual.
```

El navegador habla con un solo origen: `apps/web` recibe `/api/...` y se lo pasa
a `apps/server` por loopback. Un puerto para abrir, sin CORS.

Esa dirección se resuelve cuando se compila el front, así que moverla es
`API_PROXY_URL=... npm run build`, no una variable de arranque.

## Variables

| | |
|---|---|
| `DEEPSEEK_API_KEY` | Obligatoria. De https://platform.deepseek.com |
| `OPENAI_API_KEY` | Opcional. Hace que buscar en la biblioteca entienda lo que se le pregunta y no solo las palabras exactas. |
| `PORT` | El puerto que se abre. Por defecto 3100. |
| `APP_ORIGIN` | A dónde vuelve el navegador después de autorizar una fuente. Por defecto se toma del pedido. |
| `DATA_DIR` | Dónde se guarda todo. Por defecto `.data` al lado del repo. |
