```mermaid
flowchart TB
    subgraph UI_Shells [Core OS: UI Shells (React)]
        direction TB
        Toolbar[Playback Controls]
        Sidebar[Spin History & Filters]
        Stage[Main Stage Wrapper]
        Audit[Audit Drawer]
    end

    subgraph State_Engine [Core OS: State Engine (Zustand)]
        direction TB
        Playback[Playback Manager<br/>Handles intervals & currentFrame]
        History[Global History Store]
        Search[Fuse.js Search Index]
        DB[(LocalForage / IndexedDB)]
    end

    subgraph Plugin_Boundary [Game Plugin Boundary (Inversion of Control)]
        direction TB
        subgraph IGamePlugin [IGamePlugin Interface]
            GameBoard[ui.GameBoard Component]
            CardMeta[ui.HistoryCardMeta Component]
            AuditUI[ui.AuditTrail Component]
            ParseStats[parseCustomStats()]
            GetTags[getSearchableTags()]
        end
        
        SexyFruits[Sexy Fruits Plugin<br/>Contains 5x5 Math & Emojis]
        NewGame[Future Game Plugin<br/>Contains Megaways Math]
        
        IGamePlugin -.-> SexyFruits
        IGamePlugin -.-> NewGame
    end

    %% Flows
    Toolbar -->|Play/Scrub| Playback
    Playback -->|Provide Frame Index| Stage
    History <-->|Async Batch Save| DB
    History -->|Build Index| Search
    Search -->|Filter List| Sidebar
    
    Stage -->|Pass Raw JSON Frame| GameBoard
    Sidebar -->|Pass Raw Custom Stats| CardMeta
    Audit -->|Pass Raw JSON Frame| AuditUI
```