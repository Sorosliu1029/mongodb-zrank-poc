import { Collection, MongoClient } from 'mongodb'

const uri = 'mongodb://localhost:27017/test'
const client = new MongoClient(uri)

const batchSize = 10_000
const batchCount = 10

function getRandomUser() {
  return 'u' + Math.floor(Math.random() * batchCount * batchSize - 1)
}

interface UserScore {
  u: string
  s: number
}

async function prepare(coll: Collection<UserScore>): Promise<void> {
  try {
    await coll.drop()
  } catch {}

  for (let batch = 0; batch < batchCount; batch++) {
    await coll.insertMany(
      [...Array(batchSize).keys()].map((idx) => ({
        u: `u${batch * batchSize + idx}`,
        s: Math.floor(Math.random() * 10000),
      })),
    )
  }

  await coll.createIndexes([
    { key: { s: -1, u: 1 } },
    { key: { u: 1 }, unique: true },
    { key: { s: -1 } },
  ])
}

async function zrankSimple(
  coll: Collection<UserScore>,
  u: string,
): Promise<number> {
  const uDoc = await coll.findOne({ u })
  if (!uDoc) {
    return -1
  }
  const count = await coll.countDocuments({ s: { $gt: uDoc.s } })
  return count
}

async function zrankTricky(
  coll: Collection<UserScore>,
  u: string,
): Promise<number> {
  const explainResult = await coll
    .find(
      {
        /**
         * if include following query condition,
         * the winning plan will be a covered query plan,
         * BUT the `totalKeysExamined` will be much smaller
         * don't know why...
         * 
         * guess mongodb will skip some index entries when used in 'covered query' condition
         */
        // s: { $gte: 0 },
        u,
      },
      {
        limit: 1,
        projection: { _id: 0, s: 1, u: 1 },
        hint: { s: -1, u: 1 },
      },
    )
    .explain('executionStats')

  return explainResult['executionStats']['totalKeysExamined']
}

async function benchmark(coll: Collection<UserScore>) {
  const benchCount = 100
  {
    console.log(`run zrank simple ${benchCount} times`)
    const start = performance.now()
    for (let i = 0; i < benchCount; i++) {
      const u = getRandomUser()
      await zrankSimple(coll, u)
    }
    const end = performance.now()
    console.log(
      `zrank simple: ${((end - start) / benchCount).toFixed(3)} ms per run`,
    )
  }

  {
    console.log(`run zrank tricky ${benchCount} times`)
    const start = performance.now()
    for (let i = 0; i < benchCount; i++) {
      const u = getRandomUser()
      await zrankTricky(coll, u)
    }
    const end = performance.now()
    console.log(
      `zrank tricky: ${((end - start) / benchCount).toFixed(3)} ms per run`,
    )
  }
}

async function run() {
  try {
    await client.connect()
    const zrank = client.db().collection<UserScore>('zrank')

    await prepare(zrank)

    console.log(`total docs: ${await zrank.countDocuments()}`)

    const u = getRandomUser()

    const rank1 = await zrankSimple(zrank, u)
    console.log(`zrank simple: ${u} = ${rank1}`)

    const rank2 = await zrankTricky(zrank, u)
    console.log(`zrank tricky: ${u} = ${rank2}`)

    await benchmark(zrank)
  } finally {
    await client.close()
  }
}

run().catch((err) => console.error(err))
