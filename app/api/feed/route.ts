import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/feed.js';

// Every source is fetched at once with its own 6 second limit, so a refresh takes about that long.
export const maxDuration = 30;

export const GET = route(handler);
