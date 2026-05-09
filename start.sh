#!/bin/bash

# Run migrations automatically
php /var/www/html/backend/artisan migrate --force

# Start Apache in the foreground
apache2-foreground
