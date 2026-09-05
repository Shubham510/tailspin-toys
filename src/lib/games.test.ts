import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all categories and publishers for filter controls', async () => {
        await db.insert(categories).values([
            { name: 'Puzzle', description: 'p' },
            { name: 'Strategy', description: 's' },
        ]);
        await db.insert(publishers).values([
            { name: 'Pub Two', description: 'two' },
            { name: 'Pub One', description: 'one' },
        ]);

        const categoriesList = await getAllCategories(db);
        const publishersList = await getAllPublishers(db);

        expect(categoriesList.map((category) => category.name)).toEqual(['Puzzle', 'Strategy']);
        expect(publishersList.map((publisher) => publisher.name)).toEqual(['Pub One', 'Pub Two']);
    });

    it('filters games by category and publisher together', async () => {
        const [strategy] = await db.insert(categories).values({ name: 'Strategy', description: 'cat' }).returning({ id: categories.id });
        const [puzzle] = await db.insert(categories).values({ name: 'Puzzle', description: 'cat' }).returning({ id: categories.id });
        const [pubOne] = await db.insert(publishers).values({ name: 'Pub One', description: 'pub' }).returning({ id: publishers.id });
        const [pubTwo] = await db.insert(publishers).values({ name: 'Pub Two', description: 'pub' }).returning({ id: publishers.id });

        await db.insert(games).values([
            { title: 'Alpha', description: 'Alpha desc', starRating: 4.1, categoryId: strategy.id, publisherId: pubOne.id },
            { title: 'Bravo', description: 'Bravo desc', starRating: 4.5, categoryId: puzzle.id, publisherId: pubOne.id },
            { title: 'Charlie', description: 'Charlie desc', starRating: 3.9, categoryId: strategy.id, publisherId: pubTwo.id },
        ]);

        const filtered = await getAllGames(db, {
            categoryIds: [strategy.id],
            publisherId: pubOne.id,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha']);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
