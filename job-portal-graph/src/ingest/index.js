/** src/ingest/index.js — register the real feed adapters once (Ticket 48). */
import { registerAdapter } from './registry.js';
import { arbeitnowAdapter } from './adapters/arbeitnow.js';
import { adzunaAdapter } from './adapters/adzuna.js';
import { atsAdapter } from './adapters/ats.js';

registerAdapter(arbeitnowAdapter);
registerAdapter(adzunaAdapter);
registerAdapter(atsAdapter);
