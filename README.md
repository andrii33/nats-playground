# nats-playground
## NATS JestStream Playground

NestJS Producer and Consumer modules based on the NATS JestStream.

### Install
```js
npm i
```
### Test

```js
npm test
```

### Run on local

Start Nats local server first

```js
docker run --name nats-main -p 4222:4222 -p 6222:6222 -p 8222:8222  nats -js -V
```

Run application

```js
npm run start:dev
```

Publish messages

```js
curl http://localhost:3000/publish
```

Pull messages

```js
curl http://localhost:3000/pull
```

Clean up

```js
docker container rm nats-main
```