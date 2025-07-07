# TMSync Project Documentation

This directory contains the complete, up-to-date project documentation generated from the lifecycle management system.

## 📄 Files

- **TMSync-requirements.md** - All project requirements with detailed specifications
- **TMSync-tasks.md** - Implementation tasks with acceptance criteria  
- **TMSync-architecture.md** - Architecture Decision Records (ADRs)
- **full-project-diagram.md** - Visual project overview with Mermaid diagrams

## 🎯 Project Overview

TMSync is a multi-service browser extension for anime/movie tracking across Trakt, AniList, and MAL with a **per-service independence** architecture.

### Core Philosophy
- **Service Independence**: Each service operates independently with no unified state
- **Transparency**: Users see exactly what each service has and what will happen
- **Simplicity**: No over-engineering - only what's needed

### Key Features
- **Scrobbling**: Universal logic applied per-service 
- **Ratings**: 0.1 step precision input with accurate service conversion
- **Comments**: Service-specific tabs plus write-to-all functionality
- **UI**: Global scrobbling toggle and minimal service transparency

## 📊 Current Status

- **7 Active Requirements** (all approved)
- **7 Implementation Tasks** (ready to start)
- **5 Architecture Decisions** (all accepted)

## 🚀 Ready for Implementation

The project has complete requirements, tasks, and architectural decisions. Start with:
- TASK-0013-00-00: Enhanced service independence architecture (foundation)
- Or TASK-0014-00-00: Global scrobbling toggle (quick win)

---
*Generated from TMSync Lifecycle Management System*