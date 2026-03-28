import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const MASTERS_GOLFERS = [
  { name: 'Scottie Scheffler', country: 'USA', worldRanking: 1 },
  { name: 'Rory McIlroy', country: 'NIR', worldRanking: 2 },
  { name: 'Xander Schauffele', country: 'USA', worldRanking: 3 },
  { name: 'Collin Morikawa', country: 'USA', worldRanking: 4 },
  { name: 'Ludvig Åberg', country: 'SWE', worldRanking: 5 },
  { name: 'Jon Rahm', country: 'ESP', worldRanking: 6 },
  { name: 'Brooks Koepka', country: 'USA', worldRanking: 7 },
  { name: 'Viktor Hovland', country: 'NOR', worldRanking: 8 },
  { name: 'Tommy Fleetwood', country: 'ENG', worldRanking: 9 },
  { name: 'Patrick Cantlay', country: 'USA', worldRanking: 10 },
  { name: 'Shane Lowry', country: 'IRL', worldRanking: 11 },
  { name: 'Hideki Matsuyama', country: 'JPN', worldRanking: 12 },
  { name: 'Tony Finau', country: 'USA', worldRanking: 13 },
  { name: 'Justin Thomas', country: 'USA', worldRanking: 14 },
  { name: 'Jordan Spieth', country: 'USA', worldRanking: 15 },
  { name: 'Dustin Johnson', country: 'USA', worldRanking: 16 },
  { name: 'Will Zalatoris', country: 'USA', worldRanking: 17 },
  { name: 'Cameron Smith', country: 'AUS', worldRanking: 18 },
  { name: 'Max Homa', country: 'USA', worldRanking: 19 },
  { name: 'Bryson DeChambeau', country: 'USA', worldRanking: 20 },
  { name: 'Adam Scott', country: 'AUS', worldRanking: 21 },
  { name: 'Jason Day', country: 'AUS', worldRanking: 22 },
  { name: 'Sungjae Im', country: 'KOR', worldRanking: 23 },
  { name: 'Corey Conners', country: 'CAN', worldRanking: 24 },
  { name: 'Russell Henley', country: 'USA', worldRanking: 25 },
  { name: 'Matt Fitzpatrick', country: 'ENG', worldRanking: 26 },
  { name: 'Tyrrell Hatton', country: 'ENG', worldRanking: 27 },
  { name: 'Si Woo Kim', country: 'KOR', worldRanking: 28 },
  { name: 'Taylor Moore', country: 'USA', worldRanking: 29 },
  { name: 'Sepp Straka', country: 'AUT', worldRanking: 30 },
]

async function seed() {
  console.log('Seeding Masters 2026...')

  // Insert tournament
  const [tournament] = await db
    .insert(schema.golfTournaments)
    .values({
      name: 'Masters Tournament 2026',
      course: 'Augusta National Golf Club',
      location: 'Augusta, Georgia',
      startDate: new Date('2026-04-10T08:00:00-04:00'),
      endDate: new Date('2026-04-13T18:00:00-04:00'),
      lockTime: new Date('2026-04-10T08:00:00-04:00'),
      status: 'upcoming',
      season: 2026,
    })
    .onConflictDoNothing()
    .returning()

  if (!tournament) {
    console.log('Tournament already exists, skipping...')
    process.exit(0)
  }

  console.log(`Created tournament: ${tournament.id}`)

  // Insert golfers + add to field
  for (const golferData of MASTERS_GOLFERS) {
    const [golfer] = await db
      .insert(schema.golfGolfers)
      .values({ ...golferData, isActive: true })
      .onConflictDoNothing()
      .returning()

    if (golfer) {
      await db
        .insert(schema.golfTournamentField)
        .values({ tournamentId: tournament.id, golferId: golfer.id })
        .onConflictDoNothing()
    }
  }

  console.log(`Added ${MASTERS_GOLFERS.length} golfers to field`)
  console.log('\nDone! Tournament ID:', tournament.id)
  console.log('Copy this ID to use in your first pool.')
}

seed().catch(console.error).finally(() => process.exit(0))
