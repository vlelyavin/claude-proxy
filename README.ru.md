# claude-proxy

[readme in english](README.md)

у тебя есть подписка claude. инструментам нужен api-ключ. это сидит посередине: локальный релей, который пушит anthropic api-вызывания через oauth твоей подписки — hermes / openclaw / curl едут по подписке, а не по токен-биллингу.

## что делает

- читает oauth claude с диска при каждом запросе — ротация токена без рестарта
- форвардит в api.anthropic.com с заголовками, которых ждёт подписочный путь
- переписывает json и sse структурно, а не склейкой строк
- ретраит 429/5xx с бэкоффом
- переименовывает тулы, которых подписка не знает (mcp, memory-тулы)
- ноль npm-зависимостей. голый stdlib node

## чем не является

- не продукт anthropic и никак с ними не связан
- не хостед-сервис — крутится на твоей машине, твои креды
- не пачка чужих кредов — в репо нет ничего приватного

## по-честному

он гоняет oauth подписки мимо официального клиента. это серая зона tos anthropic. жмёшь по полной — можно потерять подписку. решай сам.

## требования

- node 24+
- `~/.claude/.credentials.json` — появляется после логина в Claude Code. нет файла — нет прокси

## запуск

```bash
git clone https://github.com/vlelyavin/claude-proxy.git
cd claude-proxy
node src/cli.js
```

без `npm install`. слушает `127.0.0.1:18801`.

```bash
curl -sS http://127.0.0.1:18801/health
```

health показывает тип подписки и экспирацию токена. если пишет `token_expired` — прокси живой, подписка нет.

модели — полными id (`claude-opus-4-6`). просто `opus` ловит 404.

## конфиг

не обязателен. дефолты покрывают обычный случай.

```bash
cp config.example.json config.json
node src/cli.js --config ./config.json
```

хост/порт, таймауты и ретраи, пути к кредам, правила rewrite, лимит тела.

## hermes

ловушка: hermes не умеет сам определять формат на loopback-url. без `api_mode: anthropic_messages` каждый запрос уходит как chat_completions и ловит 404.

```yaml
# ~/.hermes/config.yaml
custom_providers:
  - name: anthropic_proxy
    api_key: none
    api_mode: anthropic_messages
    base_url: http://127.0.0.1:18801
    discover_models: false
    model: claude-opus-4-6

model_aliases:
  opus:
    model: claude-opus-4-6
    provider: custom:anthropic_proxy
    api_mode: anthropic_messages
```

## openclaw

```bash
openclaw config set models.providers.anthropic.baseUrl '"http://127.0.0.1:18801"' --strict-json
```

## проверка

```bash
curl -sS http://127.0.0.1:18801/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  --data '{"model":"claude-opus-4-6","max_tokens":32,"messages":[{"role":"user","content":"reply with exactly: pong"}]}'
```

`pong` = весь путь работает.

## systemd

```bash
sudo ./scripts/install-systemd.sh
```

одна команда — пишет unit, включает, стартует. ручной путь в `docs/systemd.md`.

## структура

```
src/
  config/         дефолты, валидация, загрузка
  credentials/    поиск кред claude
  rewrite/        трансформы json + sse в обе стороны
  upstream/       ретрай-aware клиент
  server/         http-поверхность + /health
scripts/          systemd-инсталлер
test/             36 тестов, сеть не нужна
```

## безопасность

- только localhost, если точно не понимаешь зачем иначе
- никогда не коммить `config.json` и файлы кредов
- утёкли креды — ротация сразу

## лицензия

MIT
