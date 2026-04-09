# Dev Server

The Astro dev server runs as a user systemd service called `astro-preview.service`.

To restart it:
```
systemctl --user restart astro-preview.service
```

To check its status/logs:
```
systemctl --user status astro-preview.service --no-pager
```

If you clear the `.astro` cache directory, always restart the service afterwards so Astro can rebuild the content database.
