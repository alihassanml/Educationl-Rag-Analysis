# Design decisions

**pgvector instead of Chroma, FAISS or Pinecone.** Passages, owners, documents and vectors live in one PostgreSQL database, so a single query can filter by user or class *and* rank by similarity, and a deleted document removes its vectors in the same transaction (`ON DELETE CASCADE`). No second system to run, back up or secure. Trade-off: at very large scale (millions of chunks) a dedicated vector store searches faster; a student-sized corpus is far below that.

**Custom retrieval instead of LangChain or LlamaIndex.** The pipeline is about 500 lines: chunking at headings, vector search, a keyword rule, an evidence bar and citation building. Owning it makes every rule testable and measurable in the Evaluation Lab, and avoids a large dependency with a fast-changing API. Trade-off: new integrations (more file types) are written by hand.

**Groq as the LLM.** Fast, low-cost inference of open models, which keeps answers and quiz generation responsive. The provider sits behind `GroqService`, so changing it touches one file. Trade-off: passages leave our servers for a third party (see `security.md`), and quality depends on the chosen open model.

**RAG instead of fine-tuning.** Each student has their own material that changes daily; fine-tuning cannot be per-student, cannot cite a page, and cannot "unlearn" a deleted file. RAG answers only from retrieved passages, cites them, and can say "not found". Trade-off: answers are limited by retrieval quality, which is why retrieval is measured.

**Same-origin API through Next.js.** Keeps the httpOnly cookie first-party (no `SameSite=None`) at the cost of one extra hop.

**Fail-open rate limits.** A Redis outage must not lock out students; abuse limits are a second line behind authentication.
