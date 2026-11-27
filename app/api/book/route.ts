import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/book.js';

export const GET = route(handler);
