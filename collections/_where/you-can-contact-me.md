---
title: you can contact me
priority: 200
---

The best way to contact me is to [email me at talk@pdyxs.wtf](mailto:talk@pdyxs.wtf), or just fill out the form below.

<div class="row">
<div class="col-md-6">
{% include contact-form.html %}
</div>
<div class="col-md-6">
{% capture social %}
{% include social.md %}
{% endcapture %}
{{ social | markdownify }}
</div>
</div>
