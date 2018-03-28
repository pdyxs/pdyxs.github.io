---
layout: post
title: "QByte Devlog - v0.1: The Simulator Lives!"
date: 2017-09-19 17:00:00 +0100
categories: why
tags:
  - quantum-byte
description: How I got to v0.1 of QByte
canonical_url: 'https://medium.com/seethrough-studios/qbyte-devlog-v0-1-the-simulator-lives-5daf39c52b44'
image: https://cdn-images-1.medium.com/max/5464/1*nHg1vN01bgrmHaa3YghUbQ@2x.png
---

*You can find the latest build of [QByte (v0.1) here](https://developer.cloud.unity3d.com/share/WJDRbh7rhz/). Feedback is always appreciated. Specifically, if you are someone or know someone who’s in the quantum computing field, I’d love to hear from you. I think what I’ve built is a decent tool for those who already know the science, but I’d like to confirm that that’s the case.*

This week I hit a milestone: QByte has hit v0.1, which means that it’s a fully functional quantum computing simulator, which allows users to build circuits.

To get to this point, I’ve mostly been working on fixes to the visuals and interactions — you’ll notice that things are, in general, a lot nicer to play with than they were this time last week.

![QByte v0.1, in all its glory!](https://cdn-images-1.medium.com/max/5464/1*nHg1vN01bgrmHaa3YghUbQ@2x.png)*QByte v0.1, in all its glory!*

### Dragging on and on

A fair chunk of work from this week was a complete overhaul of how I treat dragging and dropping. This is one of those UI systems that you’re never really done working on – there’s always ways to make it feel nicer and more responsive.

In QByte, you can drag and drop 3 things: Gates, Controls and Measurements. Each works a bit differently (with controls being the most involved). Most of what I did this week was to generalise the drag-drop functionality, and to create ways to easily react to ‘hover’ states (when a draggable object is being held above an object it can be dropped on). This means that the circuit now updates as soon as a gate is hovering over a valid spot, rather than waiting until it’s dropped.

This also allowed me to clean up a lot of the interactions for controls. There’s still a bit of jankiness here or there, but mostly the interaction is really nice and smooth.

<center><iframe width="560" height="315" src="https://www.youtube.com/embed/u0nnn_4ZKGs" frameborder="0" allowfullscreen></iframe></center>

Finally, I added a drag and drop interaction for Measurement (replacing the ‘tap to measure’ approach from last time). Because of all the groundwork I’d already done, this was actually quite nice and easy.

![M is for Measurement!](https://cdn-images-1.medium.com/max/3618/1*4YCz1EgeUYzdy8ob84doWA@2x.jpeg)*M is for Measurement!*

### States! States with Entanglements!

The next thing that I (finally) did was to put in a rudimentary indicator for entanglement, which you can see above. Basically, I connect the states that are entangled with a semi-transparent black box. This works great a lot of the time, but it can definitely lead to ambiguity when more than 2 bits are involved.

![On the left, it’s pretty clear that q1 is entangled with q4 and q2 with q3. On the right, however, the states are super ambiguous: is q1 entangled with q3 or q4?](https://cdn-images-1.medium.com/max/3732/1*9lgiClRITaecJKaXNQOPIg@2x.jpeg)*On the left, it’s pretty clear that q1 is entangled with q4 and q2 with q3. On the right, however, the states are super ambiguous: is q1 entangled with q3 or q4?*

This is just a first pass, and I fully expect to revisit it in time. The state representation has proved to be a really difficult problem to solve, so I expect I’ll be tweaking it forever.

### New Gates, new gate looks

We’ve got 2 new gates in town: R1 and R2. They’re rotation gates, which essentially means that they rotate the state of a bit around a figurative (but not imaginary – no complex numbers here!) axis. R1 is a bit like the Not gate, and R2 is a bit like the Hadamard gate, but both are different in subtle ways.

![](https://cdn-images-1.medium.com/max/4630/1*CU6XNVx38WEUTzPs537qoA@2x.jpeg)

![Some circuits to compare Hadamard with R2 (left) and Not with R1 (right)](https://cdn-images-1.medium.com/max/4640/1*rqXBdCihzg4i3gWoMv9wDQ@2x.jpeg)*Some circuits to compare Hadamard with R2 (left) and Not with R1 (right)*

I’ve added these at the request of our resident academic, and I’m looking forward to playing with them more to see how they stack up. Thankfully, adding these was incredibly easy (because they’re just slightly different matrices) – most of the work was probably in making labels for the new gates.

### Bits and bobs

I’ve added a few other things here and there: changing the bit labels on the left hand side, changing the colour of the input bits (so it’s a bit clearer that they’re different and that you can tap them), and upped the bit count to 8 (so we have an actual Quantum Byte).

It’s all still pretty minimal and there’s still some issues (I’d be shocked if both the control and state representations don’t have an overhaul before the end of the project), but it’s all pretty good.

Having said that, it seems like 8 bits is just about our limit. If you entangle all 8 bits, you’ll notice a fair bit of slowdown – that’s us finally hitting our computational limits for calculation. At some point I’ll probably make the calculation part happen on a separate thread so the UI can stay smooth.

![Too… many… entangled… bits…](https://cdn-images-1.medium.com/max/5464/1*S1mcLRV6gCKbBvWbwt93qA@2x.jpeg)*Too… many… entangled… bits…*

Finally, I’ve added some versioning information and a feedback button! Though right now you’ll probably get a popup blocked notification instead of an actual email window…

### Next Steps

Next up is building tools for narrative (I’m calling the narrative toolset v0.2)! The first things I’ve got to get working are:

* Figuring out how to switch quickly and easily from one view to another; and

* Saving circuits to the cloud and sharing them

This is just to get the bare bones up and running for my cloud-based narrative editing tools… which I’ll go into more next time.

Until next time, then!
