import { eq, asc, and, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Category, Game, Publisher } from '../types/game';

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number | null;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database, filters?: GameFilters) {
    const query = db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));

    const categoryIds = filters?.categoryIds?.filter((id) => Number.isInteger(id) && id > 0) ?? [];
    const publisherId =
        filters?.publisherId !== undefined && filters.publisherId !== null ? Number(filters.publisherId) : null;

    if (categoryIds.length > 0 && publisherId !== null && Number.isInteger(publisherId) && publisherId > 0) {
        return query.where(and(inArray(categories.id, categoryIds), eq(publishers.id, publisherId)));
    }

    if (categoryIds.length > 0) {
        return query.where(inArray(categories.id, categoryIds));
    }

    if (publisherId !== null && Number.isInteger(publisherId) && publisherId > 0) {
        return query.where(eq(publishers.id, publisherId));
    }

    return query;
}

/** Return all games, optionally narrowed to selected categories and publisher.
 * @param db Injectable Drizzle database client used for in-memory testing.
 * @param filters Optional category IDs and a publisher ID to combine for filtering.
 * @returns Games sorted by title with their related category and publisher metadata attached.
 */
export async function getAllGames(db: Database, filters?: GameFilters): Promise<Game[]> {
    const rows = await baseGamesQuery(db, filters).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** Return all categories in alphabetical order for filter controls.
 * @param db Injectable Drizzle database client used for in-memory testing.
 * @returns Category records sorted by name.
 */
export async function getAllCategories(db: Database): Promise<Category[]> {
    const rows = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name));
    return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** Return all publishers in alphabetical order for filter controls.
 * @param db Injectable Drizzle database client used for in-memory testing.
 * @returns Publisher records sorted by name.
 */
export async function getAllPublishers(db: Database): Promise<Publisher[]> {
    const rows = await db.select({ id: publishers.id, name: publishers.name }).from(publishers).orderBy(asc(publishers.name));
    return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id))
        .where(eq(games.id, id))
        .get();
    return row ? mapGame(row) : null;
}
