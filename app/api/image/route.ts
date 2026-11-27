import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/image.js';

export const GET = route(handler);
