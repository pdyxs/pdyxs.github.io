---
layout: printable
title: CV
---
<h1>Paul Sztajer - Interactive Artist</h1>
<p style="float: right">
  <a href="mailto:paul@sztajer.org">paul@sztajer.org</a>

</p>
<p>All this and more can be found at <a href="http://pdyxs.wtf">pdyxs.wtf</a></p>

{% include title.html title="Who" %}
{% include aboutme.md %}

{% include title.html title="Where" subtitle="I've worked" %}
{% include workhistory.md %}

{% include title.html title="What" subtitle="I've made" %}
{% assign pages = site.pages | sort: 'priority' | reverse %}
<table>
{% for place in pages %}
{% if place.url contains 'what' and place.url != '/what/' %}
  {% if place.thumbnail %}
    {% assign thumb = place.thumbnail %}
  {% else %}
    {% assign thumb = place.feature %}
  {% endif %}
  <tr class="project">
    <td>
      <div class="project-img"
           style="background-image:url('{{place.url}}/{{thumb}}')" />
    </td>
    <td class="content">
      <h3>{{place.title}}</h3>
      <p>{{place.tag}}</p>
      {% include definitions.html list=place.definitions context="cv" %}
      {% include quotes.html quotes=place.quotes context="cv" %}
    </td>
  </tr>
{% endif %}
{% endfor %}
</table>
