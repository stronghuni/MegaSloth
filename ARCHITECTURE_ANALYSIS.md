# MegaBot 아키텍처 분석 및 개선안

## 1. 비교 분석

### 1.1 Graphiti (Graph RAG Memory System)

**핵심 개념:**
- **Entity-Centric Architecture**: 정보를 독립된 청크가 아닌 엔티티(노드)와 관계(엣지)로 구조화
- **Bi-Temporal Model**: 이벤트 발생 시간(T)과 시스템 인지 시간(T') 이중 추적
- **Three-Tier Subgraph**:
  1. Episode Subgraph (G_e): 원본 대화/이벤트 기록
  2. Semantic Entity Subgraph (G_s): 추출된 엔티티와 관계
  3. Community Subgraph (G_c): 엔티티 클러스터링

**주요 장점:**
- 시간에 따른 지식 변화 추적 (fact supersession)
- 모순 감지 및 자동 무효화
- 하이브리드 검색 (semantic + keyword + graph traversal)
- 멀티테넌시 지원

### 1.2 OpenAI Codex CLI

**핵심 아키텍처:**
```
┌─────────────────────────────────────────────────────────┐
│                      Codex Instance                      │
│  ┌──────────────┐    ┌───────────────┐                  │
│  │ Submission   │───►│ Event Queue   │                  │
│  │ Queue (SQ)   │    │ (EQ)          │                  │
│  └──────────────┘    └───────────────┘                  │
│         │                    ▲                          │
│         ▼                    │                          │
│  ┌──────────────────────────────────────────────┐      │
│  │                   Session                     │      │
│  │  ┌────────────┐  ┌────────────┐              │      │
│  │  │SessionState│  │ActiveTurn  │              │      │
│  │  │(persistent)│  │(per-turn)  │              │      │
│  │  └────────────┘  └────────────┘              │      │
│  │         │              │                      │      │
│  │         ▼              ▼                      │      │
│  │  ┌────────────────────────────────────┐     │      │
│  │  │           ToolRouter               │     │      │
│  │  │  - Registry (handlers)             │     │      │
│  │  │  - Sandbox policies                │     │      │
│  │  │  - Approval store                  │     │      │
│  │  └────────────────────────────────────┘     │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**핵심 패턴:**
1. **Queue-Based Communication**: 비동기 Op 제출 → Event 스트리밍
2. **State Separation**: SessionState (세션 전체) vs ActiveTurn (현재 턴)
3. **Context Compaction**: 컨텍스트 창 95% 도달 시 자동 요약
4. **Tool Orchestration**: ToolRouter → Registry → Handler 체인
5. **Multi-Agent Control**: AgentControl을 통한 sub-agent 스폰/관리

### 1.3 현재 MegaBot 아키텍처

**현재 구조:**
```
┌───────────────────────────────────────────────────┐
│                    MegaBot                         │
│  ┌─────────────┐                                  │
│  │ SkillEngine │ ─────► AgentCore                 │
│  └─────────────┘           │                      │
│        │                   ▼                      │
│        │            ┌──────────────┐              │
│        │            │ ClaudeClient │              │
│        │            └──────────────┘              │
│        │                   │                      │
│        ▼                   ▼                      │
│  ┌─────────────────────────────────────────────┐ │
│  │           ContextManager (Simple)            │ │
│  │     - Message history (in-memory)            │ │
│  │     - No temporal tracking                   │ │
│  │     - No compaction                          │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

**현재 한계:**
1. 단순 메시지 배열 기반 컨텍스트 (구조화 X)
2. 세션 종료 시 메모리 손실
3. 컨텍스트 창 관리 부재 (토큰 오버플로우 위험)
4. Tool 실행 결과 추적/요약 미흡
5. Multi-agent 지원 부재

---

## 2. 개선 제안

### 2.1 Memory Architecture 개선 (Graphiti 패턴 적용)

**새로운 메모리 시스템:**
```typescript
// Episode-based memory with entity extraction
interface EpisodeNode {
  id: string;
  content: string;
  timestamp: Date;
  source: 'user' | 'assistant' | 'tool' | 'webhook';
  metadata: Record<string, unknown>;
}

interface EntityNode {
  id: string;
  name: string;
  type: 'repository' | 'user' | 'pr' | 'issue' | 'branch' | 'concept';
  attributes: Record<string, unknown>;
  embedding?: number[];
}

interface EntityEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  fact: string;
  validFrom: Date;
  validUntil?: Date;
  confidence: number;
}
```

### 2.2 Agent Loop 개선 (Codex 패턴 적용)

**Queue-Based Architecture:**
```typescript
interface Op {
  type: 'user_input' | 'tool_result' | 'interrupt' | 'configure';
  payload: unknown;
  submissionId: string;
}

interface Event {
  type: 'turn_started' | 'content_delta' | 'tool_call' | 'turn_complete' | 'error';
  payload: unknown;
  submissionId: string;
}

class AgentSession {
  private submissionQueue: AsyncQueue<Op>;
  private eventEmitter: EventEmitter;
  private sessionState: SessionState;
  private activeTurn: ActiveTurn | null;
}
```

### 2.3 Context Compaction

**자동 컨텍스트 요약:**
```typescript
interface CompactionStrategy {
  // 컨텍스트 창의 90% 도달 시 트리거
  shouldCompact(tokenUsage: TokenUsage): boolean;

  // 오래된 메시지 요약
  compact(history: Message[]): Promise<{
    summary: string;
    retainedMessages: Message[];
  }>;
}
```

---

## 3. 구현 계획

### Phase 1: State Management 리팩토링
1. SessionState / ActiveTurn 분리
2. Queue-based Op/Event 시스템
3. Token usage tracking

### Phase 2: Memory System
1. Episode 기반 대화 저장
2. Entity 추출 (LLM 기반)
3. Graph 저장소 (SQLite + 관계)

### Phase 3: Context Management
1. Compaction 전략 구현
2. Hybrid retrieval (recent + relevant)
3. Tool output truncation

### Phase 4: Multi-Agent
1. AgentControl 구현
2. Sub-agent spawning
3. Inter-agent communication

---

## 4. 구현 완료 (2024)

### 4.1 State Management (Codex 패턴)
- `src/agent/state/session.ts` - SessionState: 세션 전체 상태 관리
  - Token usage tracking
  - Rate limit management
  - Compaction 상태 추적
- `src/agent/state/turn.ts` - ActiveTurn: 턴별 상태 관리
  - Pending approvals
  - Tool results tracking
  - Task management

### 4.2 Queue-Based Communication (Codex 패턴)
- `src/agent/queue/types.ts` - Op/Event 타입 정의
- `src/agent/queue/submission.ts` - Submission Queue
  - 비동기 Op 제출 및 처리
- `src/agent/queue/events.ts` - Event Queue
  - 이벤트 스트리밍 및 구독

### 4.3 Context Management
- `src/agent/context/manager.ts` - ContextManager
  - 메시지 히스토리 관리
  - 토큰 추정
  - 컨텍스트 직렬화
- `src/agent/context/compaction.ts` - CompactionStrategy
  - 90% 컨텍스트 도달 시 자동 요약
  - LLM 기반 요약 생성

### 4.4 Graph Memory System (Graphiti 패턴)
- `src/memory/graph/nodes.ts` - 노드 타입
  - EpisodeNode: 원본 이벤트
  - EntityNode: 추출된 엔티티
  - CommunityNode: 클러스터
- `src/memory/graph/edges.ts` - 엣지 타입
  - EpisodicEdge: 에피소드↔엔티티 연결
  - EntityEdge: 엔티티 간 관계 (Bi-temporal)
  - 모순 감지 및 해결
- `src/memory/graph/store.ts` - GraphStore
  - SQLite 기반 그래프 저장소
  - 시간 기반 쿼리 지원

### 4.5 Entity Extraction
- `src/memory/extraction/entity.ts` - EntityExtractor
  - LLM 기반 엔티티/관계 추출
  - Git 도메인 특화 타입

### 4.6 Hybrid Retrieval
- `src/memory/retrieval/hybrid.ts` - HybridRetriever
  - Recent + Relevant 컨텍스트 조합
  - 자동 에피소드 인제스트
  - 그래프 기반 관련 정보 검색

### 4.7 Improved Agent Session
- `src/agent/session.ts` - AgentSession
  - Queue-based agent loop
  - Graph memory 통합
  - 자동 compaction
  - Tool execution with tracking

---

## 5. 새로운 파일 구조 (구현 완료)

```
src/
├── agent/
│   ├── core.ts              # 기존 AgentCore (유지)
│   ├── session.ts           # ✅ NEW: 개선된 Agent Session
│   ├── claude-client.ts     # Claude API 클라이언트
│   ├── context-manager.ts   # 기존 컨텍스트 (유지)
│   ├── state/               # ✅ NEW: State Management
│   │   ├── session.ts       # SessionState (세션 전체)
│   │   ├── turn.ts          # ActiveTurn (턴별)
│   │   └── index.ts
│   ├── queue/               # ✅ NEW: Queue-Based Communication
│   │   ├── types.ts         # Op/Event 타입
│   │   ├── submission.ts    # Submission Queue
│   │   ├── events.ts        # Event Queue
│   │   └── index.ts
│   └── context/             # ✅ NEW: Context Management
│       ├── manager.ts       # ContextManager
│       ├── compaction.ts    # Compaction Strategy
│       └── index.ts
├── memory/                  # ✅ NEW: Graph Memory System
│   ├── graph/
│   │   ├── nodes.ts         # Episode/Entity/Community Nodes
│   │   ├── edges.ts         # Bi-temporal Edges
│   │   ├── store.ts         # SQLite Graph Store
│   │   └── index.ts
│   ├── extraction/
│   │   ├── entity.ts        # LLM Entity Extraction
│   │   └── index.ts
│   ├── retrieval/
│   │   ├── hybrid.ts        # Hybrid Retrieval
│   │   └── index.ts
│   └── index.ts
├── tools/                   # 기존 Tool Registry (유지)
│   └── registry.ts
└── ...                      # 기타 기존 파일들
```
