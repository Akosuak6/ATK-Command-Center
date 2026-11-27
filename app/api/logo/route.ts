import { route } from '../../../src/server/adapter';
import handler from '../../../src/server/handlers/logo.js';

export const GET = route(handler);
