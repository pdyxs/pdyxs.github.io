---
layout: post
title: "QByte Devlog - Taking the Measure"
date: 2017-09-19 17:00:00 +0100
categories: why
tags:
  - quantum-byte
description: Making quantum measurements work in the QByte engine
canonical_url: 'https://medium.com/seethrough-studios/qbyte-devlog-taking-the-measure-fb06de96d368'
image: https://cdn-images-1.medium.com/max/5464/1*-erHcYtTXrYO-Ohor5hFxg@2x.jpeg
---

*You can find the latest build for QByte [here](https://developer.cloud.unity3d.com/share/ZJTngRQaoM/). Feedback is always appreciated!*

So this is the first devlog I’ve made, which means it’s missing a lot of context… but writing all of that context would take forever, so we’re just going to go with what we’ve got.

This week, I finalised measurement in the QByte quantum engine, and made a pretty nasty interface for doing it.

![A circuit, made using the latest build. Now with 2 more colours!](https://cdn-images-1.medium.com/max/5464/1*-erHcYtTXrYO-Ohor5hFxg@2x.jpeg)*A circuit, made using the latest build. Now with 2 more colours!*

### Looking in the box…

When you measure a quantum bit you look at it and see what state it has:

* if it’s state is 0, you get 0;
* if it’s state is 1, you get 1; and
* if it’s in superposition, you force the bit to choose whether it’s 0 or 1. It does so randomly based on the probabilities in its internal state. The value of that bit is now the value that was measured.
* if the bit is entangled with other bit(s), its choice affects the state of the bits it’s entangled with

### When to measure

Usually, measurement is treated as a gate, just like the Not gate and the Hadamard one.

![A normal Quantum Circuit treating Measurement like other gates (the dial icon represents measurement)](https://cdn-images-1.medium.com/max/2000/1*QJJrGElI3pwZvb32JzlclA@2x.png)*A normal Quantum Circuit treating Measurement like other gates (the dial icon represents measurement)*

However, there’s a problem with this: generally if two gates are simultaneous, we can combine their effects (into a single, bigger matrix, for the mathsier of you) and run them all at once. But measurement *must* happen either before or after a gate is run (it’s not a matrix operation at all!). So if we just let measurement be a gate, we have to choose one of these (so we’re consistent), and the choice is pretty arbitrary. In reality, measurement should *never* be placed vertically aligned with other quantum gates (as vertical alignment implies simultanaeity).

Our solution to this is simple: measurement happens between gates, where states are displayed. This also actually helped with some of the representation, as we’ll see later on.

### The guts of it

While measurement happening between gates was a really nice and elegant solution design-wise, it somewhat upended the approach I’d taken to representing quantum circuits internally.

Previously, each bit had a Quantum State associated with each position along its line. These could be copies of earlier states (when no gates are placed) or they can be shared with other bits (when entangled), but there’s strictly only one state per ‘bit position’ (as I call it in the code).

Suddenly, each bit position can have up to 2 states: the existing one, and the state that exists once measured. This was a fairly nerve wracking overhaul of the code. It wasn’t improved when I totally finished implementing measurement, only to realise I’d done the whole thing wrong (the approach I’d taken didn’t deal with measuring entangled bits properly) and had to redo most of it.

Oh well – I got there in the end in any case.

### The interface

The interaction is really simple: click on a state (or the space where a state would be shown) to measure it, click it again to turn it off.

The parts of the state with a green background shows what’s been measured – they’ll either all be 0's or all be 1's. Every time you turn on a measurement it’s re-calculated, so if you keep clicking it’ll change randomly.

![A circuit with some measurement. The green pieces are what was measured in each case.](https://cdn-images-1.medium.com/max/5464/1*Ba8pA7ZiYYQb-2a0LM0STw@2x.jpeg)*A circuit with some measurement. The green pieces are what was measured in each case.*

If the state is entangled with another bit, the part of the other bit’s state that was measured will be shown in blue.

![Measured states that are in superposition! The blue pieces are the parts of the state that have been forced by the green measurements.](https://cdn-images-1.medium.com/max/5464/1*QGJsST0Wg6sYMk83ldjaJQ@2x.jpeg)*Measured states that are in superposition! The blue pieces are the parts of the state that have been forced by the green measurements.*

This approach means that you can see both the state that came out of the last set of gates, as well as the state that was measured (and thus will be used from here on in).

### Why it needs work…

One of the things I really want to allow is for people to actively choose what measurement is taken, so they can see what happens to the rest of the circuit as a result. The current ‘click to add a measurement’ mechanic totally removes my ability to let players do that.

What I’m going to do is to add Measurement as a draggable object on the palette, so that adding/removing measurements is a matter of dragging it on and off states. I then want to make clicking it cycle between ‘0' and ‘1' being measured (assuming there is a possibility for both), and add a button to the state representation to randomly re-measure as well.

### Next Steps

At this stage, the core circuit toolkit is finished! Which is kinda awesome. I’m really pumped to work on the next thing (I’ve started working out plans for being able to save and load circuits, and I’ve got a kick-ass idea for the story editor for the game). But first, I want to spend a couple of days just cleaning up the scientific circuit view:

* fixing up some of the graphics and transitions;

* putting in a rudimentary entanglement visualisation (so you can at least work out when entanglement is happening); and

* redoing the measurement interface

At that stage, I think I can say we’re at version 0.1, which will be pretty fantastic.
