// Dev-only entry: Base.astro imports this by path under import.meta.env.DEV.
import { mount } from 'svelte';
import InspectButton from './InspectButton.svelte';
import { devDock } from '../site/dev-dock.ts';

mount(InspectButton, { target: devDock() });
