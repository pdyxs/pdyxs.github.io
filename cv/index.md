---
layout: printable
title: CV
sitemap: false
noindex: true
references:
  - head: Rick Martin
    texts:
      - Founder, Equal reality
    links:
      - text: rick@equalreality.com
        url: rick@equalreality.com
      - text: or schedule a meeting at https://meetings.hubspot.com/rick118
        url: https://meetings.hubspot.com/rick118
  - head: Daniel Keogh
    texts:
      - Head of the Creative Content Team at 3P Learning (2018)
      - 0437 253 566
    links:
      - text: Daniel.Keogh@UNSW.edu.au
        url: Daniel.Keogh@UNSW.edu.au
---
<h1>Paul Sztajer</h1>
<p style="float: right">
  <a href="mailto:talk@pdyxs.wtf">talk@pdyxs.wtf</a><br />
  +61 423 224 945
</p>
<p>All this and more can be found at <a href="http://pdyxs.wtf">pdyxs.wtf</a></p>

{% include title.html title="Who" subtitle="I am" %}
{% include aboutme.md %}

{% include title.html title="What" subtitle="I can do" %}
{% include definitions.html list=site.data.skills.all %}

{% include title.html title="Where" subtitle="I've worked" %}
{% include workhistory.html %}

{% include title.html title="Who" subtitle="will talk about me" %}
{% include definitions.html list=page.references %}

{% include title.html title="What" subtitle="I've made" %}
Please find extra resources about these projects in the 'Portfolio' folder.
{% assign coll = site.collections | where: "label", "pastprojects" | first %}
{% assign pages = coll.docs | sort: 'priority' | reverse %}
<table>
{% for place in pages %}
{% if place.tags contains 'nocv' %}
{% else %}
  <tr class="project border">
    <td class="pt-3 pl-3">
      <div class="img-wrap">
      <div class="project-img"
           style="background-image:url('/pastprojects/{{place.slug}}/thumb/{{place.image}}')">
      </div></div>
    </td>
    <td class="content pt-2 pr-3">
      <h3>{{place.title}}</h3>
      {% if place.description %}
      <p>{{place.description}}</p>
      {% endif %}
      {% if place.cvdescription %}
      <p>{{place.cvdescription}}</p>
      {% endif %}
      {% include definitions.html list=place.definitions context="cv" %}
      {% include quotes.html quotes=place.quotes context="cv" %}
    </td>
  </tr>
{% endif %}
{% endfor %}
</table>

{% include title.html title="What" subtitle="else I've done" %}
* Bachelor of Science Advanced (Physics/Computer Science), Bachelor of Engineering (Software) at the University of Sydney
* Honours in Software Engineering
* Co-run Art Heist, an art exhibition with a larcenous twist
* Invited to partake in qiskit camp Europe, a quantum computing hackathon on a Swiss Alp
* A 3 month residency with pvi collective, a tactical media art group based in Perth
* Participant of The Arctic Circle residency, a 2 week art/science residency in Svalbard
* Administrator of the Sydney Chapter of the International Game Developers Association (IGDA)
* Run the Sydney site of the Global Game Jam
* Co-host of the Game Engine podcast - a podcast about game development
