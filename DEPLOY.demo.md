# Docker Swarm demo deployment

The browser uses two public origins:

- `UI_ORIGIN` serves the Angular application.
- `API_BASE_URL` serves every REST request and the Socket.IO `/ws` namespace.

Create exactly two Cloudflare public hostnames for the application. Route the UI
hostname to `http://ui:80` and the API hostname to `http://api:3000`. Both REST
and WebSocket traffic use the API hostname; no third WebSocket hostname is
needed. MySQL and Redis remain private on the overlay network.

## Build and push

Pushes to each repository's `main` branch publish the `demo` image through
GitHub Actions:

```text
ghcr.io/REPO_OWNER/streamline-ui
ghcr.io/REPO_OWNER/streamline-api
```

Version tags such as `v1.2.3` additionally publish `1.2.3` and `1.2`. Every
workflow run publishes an immutable `sha-...` tag. To build and publish the demo
images manually instead:

```sh
docker build -t ghcr.io/${REPO_OWNER}/streamline-ui:demo .
docker build -t ghcr.io/${REPO_OWNER}/streamline-api:demo ../streamline-api
docker push ghcr.io/${REPO_OWNER}/streamline-ui:demo
docker push ghcr.io/${REPO_OWNER}/streamline-api:demo
```

## Configure and deploy

Create the tunnel token as a Swarm secret, fill in `demo.env`, and run the
deployment script. By default, MySQL and Redis are pinned to `ds-1` and stored
below `/mnt/swarm/data/streamline-demo`:

```sh
printf '%s' 'CLOUDFLARE_TUNNEL_TOKEN' | docker secret create cloudflare_tunnel_token -
cp demo.env.example demo.env
./scripts/deploy-swarm-stack-demo.sh
```

The script validates required values, renders all `${...}` expressions locally,
and streams the resolved configuration to `ds-1`. The deployment can be
customized with:

- `DEPLOY_HOST` for the SSH destination (`ds-1` by default).
- `STACK_NAME` for the stack and its storage namespace (`streamline-demo`).
- `REMOTE_BASE_PATH` for remote storage (`/mnt/swarm`).
- `DATA_NODE_HOST` for the MySQL and Redis Swarm node (`ds-1`).
- `DATA_NODE_SSH_HOST` when the data node's SSH destination differs from its
  Swarm hostname (defaults to `DATA_NODE_HOST`).
- `TUNNEL_SECRET_NAME` for the external Swarm secret
  (`cloudflare_tunnel_token`).

For example, `STACK_NAME=preview REMOTE_BASE_PATH=/srv/swarm
DATA_NODE_HOST=swarm-2 ./scripts/deploy-swarm-stack-demo.sh` stores persistent
data below `/srv/swarm/data/preview` and pins it to `swarm-2`.

The packages must be public for anonymous swarm pulls. If they remain private,
run `docker login ghcr.io` on the manager before deployment; the
`--with-registry-auth` flag forwards those credentials to swarm nodes.
The example pins `cloudflared` by a multi-architecture digest; update
`CLOUDFLARED_IMAGE` deliberately when upgrading it.

Configure the remotely managed Cloudflare tunnel with these ingress routes:

```text
demo.example.com      -> http://ui:80
api.demo.example.com  -> http://api:3000
```

Cloudflare must allow WebSockets on the API hostname (enabled by default). Add
the UI origin to the Auth0 application's allowed web origins/callback URLs when
that Auth0 client is used for the demo. `AUTH0_AUDIENCE` remains the API
identifier configured in Auth0; it is independent from CORS.

`API_BASE_URL` is written into `runtime-config.js` when the UI container starts,
so the same image can move between demo domains. `UI_ORIGIN` is read by the API
at startup and applies to both HTTP CORS and the Socket.IO gateway. It can be a
comma-separated list when more than one UI origin is required.

For a public demo, replace the example plaintext application credentials with
an external secret-management workflow appropriate to the swarm. Swarm service
environment variables are visible to service administrators.
