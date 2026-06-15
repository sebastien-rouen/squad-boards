"""Client httpx partagé (calendriers ICS + proxy JIRA).

Le client est créé/fermé par le lifespan FastAPI. Les routeurs accèdent à
`http_client.client` au moment de l'appel (jamais à l'import) — il est alors initialisé.
"""
import httpx

client: httpx.AsyncClient | None = None


async def startup():
    global client
    client = httpx.AsyncClient(timeout=30.0)


async def shutdown():
    if client is not None:
        await client.aclose()
