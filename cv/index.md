---
layout: printable
title: CV
sitemap: false
---
<h1>Paul Sztajer</h1>
<p style="float: right">
  <a href="mailto:talk@pdyxs.wtf">talk@pdyxs.wtf</a><br />
  +1 415 494 9798
</p>
<p>All this and more can be found at <a href="http://pdyxs.wtf">pdyxs.wtf</a></p>

{% include title.html title="Who" %}
{% include aboutme.md %}

{% include title.html title="What" subtitle="I can do" %}
{% include definitions.html list=site.data.skills.all %}

{% include title.html title="Where" subtitle="I've worked" %}
{% include workhistory.md %}

{% include title.html title="What" subtitle="I've made" %}
{% assign pages = site.pages | sort: 'priority' | reverse %}
<table>
{% for place in pages %}
{% if place.url contains 'what' and place.url != '/what/' %}
  <tr class="project">
    <td>
      <div class="img-wrap">
      <div class="project-img"
           style="background-image:url('{{place.url}}/{{place.image}}')">
      </div></div>
    </td>
    <td class="content">
      <h3>{{place.title}}</h3>
      <p>{{place.description}}</p>
      {% include definitions.html list=place.definitions context="cv" %}
      {% include quotes.html quotes=place.quotes context="cv" %}
    </td>
  </tr>
{% endif %}
{% endfor %}
</table>
