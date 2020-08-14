---
layout: printable
title: Code Samples
sitemap: false
noindex: true
---
# Code Samples

{% include title.html title="Quantum Byte" subtitle="QState.cs" %}
Quantum Byte is a 8-bit quantum computer simulation which I built to prioritise the usability and understandability of quantum computing, which you can try at [http://qbyte.surge.sh](http://qbyte.surge.sh). Mostly I achieve this by ensuring that the simulator gives real-time feedback about the intermediate states of the quantum computer as you program it.

Achieving this, however, required an unusual approach to simulating the quantum computer's states. An n bit quantum state can be represented by a 2<sup>n</sup> x 2<sup>n</sup> matrix. Unlike a classical computer, it is often impossible to separate the state of bits from each other, as states with entangled bits cannot be simplified without losing data. Most quantum simulators calculate the state of all the bits together, only attempting to separate them at the end in order to save processing time. The separated state, though, is what's most useful for displaying information.

To achieve real-time feedback on the state of individual bits, a different approach was required. Quantum Byte keeps the quantum states as small as possible at all times, combining the states of bits together to perform operations and then separating them where possible afterwards. Each QState represents a state in any moment of time across an arbitrary number of bits. This minimises the cost of each operation and ensures that the interface can remain as responsive as possible.

{% include title.html title="Particulars" subtitle="ParticleGhost.cs" %}
Particulars is a game where you control a quark, and feel the push and pull of the four fundamental forces on you as you solve puzzles. The full game is available on Steam, and I'm in the midst of repackaging the game for educators as a website.

One of the problems I found while making Particulars was that new particles that spawned in would displace existing particles suddenly. With larger particles, this displacement could be quite dramatic, and could be both distracting and disorienting for players.

I wanted to build a system that would nudge particles out of the way intelligently, while still conserving the momentum of each particle as much as possible. In building such a system, it was important to balance the correctness of the underlying physics with the usability and readability of the game state.

I also wanted to utilise the existing physics engine (Box2D) to ensure that these nudges were appropriate - that they would take level geometry into account and move each particle to the most appropriate place.

The Particle Ghost system was my solution to this problem - the algorithm places 'ghost' colliders where a particle will be when new particles spawn, and checks the next frame to see if it's been moved by collisions with the spawning particles. When it does move, it nudges the particle towards the collider's new location, keeping track of the momentum added and taking the opportunity to undo that change when possible.

While quite naiive in its predictive approach, this solution proved to be effective with a small computation footprint.
