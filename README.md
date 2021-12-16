# mongodb-zrank-poc

Using MongoDB only, implement redis-like [zrank](https://redis.io/commands/zrank) command

## Collection structure

```js
{
  u: string, // user id
  s: number, // score
}
```

## Implementations

1. simple way:
   1. with `{ u: 1 }` and `{ s: -1 }` indexes
   2. query by `{ u }` to get user's score `user_score`
   3. count documents by `{ s: { $gt: user_score } }` to get rank
2. tricky way:
   1. with `{ s: -1, u: 1 }` index
   2. find one by `{ u }`, with projection `{ _id: 0, s: 1, u: 1 }` to make it covered query, and force hint with index `{ s: -1, u: 1 }`
   3. check [explain](https://docs.mongodb.com/v5.0/reference/command/explain/#mongodb-dbcommand-dbcmd.explain) result to get [totalKeysExamined](https://docs.mongodb.com/v5.0/reference/explain-results/#mongodb-data-explain.executionStats.totalKeysExamined) as rank

## Correctness and efficiency

```shell
> node dist/index.js

total docs: 100000
zrank simple: u10460 ranks at 86082
zrank tricky: u10460 ranks at 86083

run zrank simple 100 times
zrank simple: 19.089 ms per run

run zrank tricky 100 times
zrank tricky: 89.732 ms per run
```
