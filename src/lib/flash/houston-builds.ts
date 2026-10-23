// The three Houston builds compared on /experiments/houston-builds (#200).
// SWFs are gitignored (public/experiments/houston/); see the page for fetch commands.
// The mobile port has no date in the issue beyond "AIR iOS port", so it carries 2015.

export interface HoustonBuild {
  id: string;
  name: string;
  date: string;
  swfUrl: string;
  width: number;
  height: number;
}

export const HOUSTON_BUILDS: HoustonBuild[] = [
  { id: 'p1', name: 'Prototype 1', date: 'January 2015', swfUrl: '/experiments/houston/p1/houston.swf', width: 1024, height: 768 },
  { id: 'p2', name: 'Prototype 2', date: 'May 2015', swfUrl: '/experiments/houston/p2/houston.swf', width: 1024, height: 768 },
  { id: 'mobile', name: 'Mobile (AIR iOS port)', date: '2015', swfUrl: '/experiments/houston/mobile/HoustonMobile.swf', width: 1024, height: 768 },
];
