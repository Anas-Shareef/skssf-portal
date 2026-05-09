#!/bin/bash

# Run migrations and seeders automatically
php /var/www/html/backend/artisan migrate --force
php /var/www/html/backend/artisan db:seed --force

# Start Apache in the foreground
apache2-foreground
