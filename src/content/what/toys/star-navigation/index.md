---
title: Star System Navigation
description: A mechanic for flying through a solar system
status: unlisted
date: 2026-09-23
tags: []
inspected: true
headerMedia: star-system
---
When I think about interstellar travel, I'm much more interested in models that don't require faster than light travel or shortcuts like wormholes, because you're then forced to think through the physics.

If you're going to move fast enough to get to another star system, chances are that you've spent a long time (and a lot of fuel) accelerating to get there, and you're going to then have to spend an equally long time decellerating to leave. If you're not confident that this star system is your final destination (e.g. if you're a colony ship looking for a new home), you'll be doing a fly-by.

This is an interface I've had in mind for playing through a fly-by of a solar system, allowing players to visit some planets on the way through, but not all of them. I imagine that you get to do 1 action (e.g. a close scan, an expedition, or gather supplies) at each planet as you pass it by. This allows players to explore new star systems in a limited way, and creates a dynamic puzzle based on the players current goals.

A few notes about this implementation:
* This implementation has the planets moving a fair bit more than they probably would if the ship was moving at a decent %age of the speed of light. I like the way the planet orbits complicate the puzzle.
* All the planets here are the same. I'd probably want the planet's mass to affect how much you can adjust your trajectory (since you're using the planet's gravity to adjust it)
* This is currently better on desktop than on mobile - the hover state really helps the whole thing work.

