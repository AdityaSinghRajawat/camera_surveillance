# Convenience targets. The canonical entry point is `docker compose up --build`.
.PHONY: up down build logs ps restart clean seed migrate backend-logs worker-logs web-logs

up: ## Build and start the whole stack
	docker compose up --build

up-d: ## Start detached
	docker compose up --build -d

down: ## Stop and remove containers
	docker compose down

clean: ## Stop and remove containers + volumes (wipes the database)
	docker compose down -v

build: ## Build all images
	docker compose build

ps: ## Show service status
	docker compose ps

logs: ## Tail all logs
	docker compose logs -f

backend-logs:
	docker compose logs -f backend

worker-logs:
	docker compose logs -f worker

web-logs:
	docker compose logs -f frontend

restart: ## Recreate the stack
	docker compose down && docker compose up --build
