import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/preview.js';

export const GET = route(handler);
