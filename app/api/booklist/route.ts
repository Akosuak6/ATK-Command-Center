import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/booklist.js';

// Reading a TikTok and asking Claude takes up to about 40 seconds.
export const maxDuration = 60;

export const POST = route(handler);
