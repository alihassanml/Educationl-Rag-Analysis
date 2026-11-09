"""Sample study documents for the evaluation. One topic per page, so each page is one chunk."""

CORPUS: dict[str, list[str]] = {
    "Intro to Programming": [
        "Variables and data types. A variable is a named location in memory that stores a value. "
        "Common data types are integers for whole numbers, floats for decimal numbers, strings for "
        "text, and booleans for true or false values. A statically typed language checks types "
        "before the program runs, while a dynamically typed language checks types while the program "
        "runs. Python is dynamically typed and Java is statically typed. Assigning a value of the "
        "wrong type can cause a type error.",
        "Control flow and loops. Control flow decides which statements run. An if statement runs a "
        "block only when its condition is true, and else handles the other case. A for loop repeats "
        "a block a fixed number of times or once for each item in a collection. A while loop repeats "
        "as long as its condition stays true. An infinite loop happens when the condition never "
        "becomes false. The break statement exits a loop early, and continue skips to the next "
        "iteration.",
        "Functions and recursion. A function is a reusable block of code with a name. Parameters are "
        "the inputs of a function and the return value is its output. Recursion is a method where a "
        "function calls itself to solve smaller instances of a problem. Every recursive function "
        "needs a base case that stops the calls. Without a base case the function calls itself "
        "forever and causes a stack overflow, because every call uses space on the call stack. The "
        "factorial of a number is a classic recursive example.",
        "Stacks and queues. A stack is a last in first out structure. The push operation adds an "
        "item to the top and the pop operation removes the top item. Stacks are used for undo "
        "features and for the call stack. A queue is a first in first out structure. Enqueue adds an "
        "item at the back and dequeue removes the item at the front. Queues are used for print jobs "
        "and breadth first search. Both can be built with arrays or linked lists.",
    ],
    "Cell Biology": [
        "Cell structure. All living things are made of cells. The nucleus contains the DNA and "
        "controls the activity of the cell. Mitochondria release energy through respiration. "
        "Ribosomes make proteins. The cell membrane controls which substances enter and leave the "
        "cell. Plant cells also have a rigid cell wall, a large permanent vacuole, and chloroplasts, "
        "which animal cells do not have.",
        "Photosynthesis. Photosynthesis takes place in chloroplasts, which contain chlorophyll, the "
        "green pigment that absorbs light. Plants convert carbon dioxide and water into glucose and "
        "oxygen using light energy. The equation is six carbon dioxide plus six water gives glucose "
        "plus six oxygen. The light dependent reactions happen in the thylakoid membranes and the "
        "Calvin cycle happens in the stroma. Light intensity, carbon dioxide concentration and "
        "temperature limit the rate of photosynthesis.",
        "Cellular respiration. Respiration releases energy from glucose to make ATP. Aerobic "
        "respiration uses oxygen and produces carbon dioxide, water and about thirty ATP molecules "
        "per glucose, mostly in the mitochondria. Anaerobic respiration in muscle cells happens "
        "without oxygen and produces lactic acid. Yeast carry out fermentation and produce ethanol "
        "and carbon dioxide. Glycolysis takes place in the cytoplasm and splits one glucose molecule "
        "into two pyruvate molecules.",
        "DNA and protein synthesis. DNA is a double helix made of two strands of nucleotides. "
        "Adenine pairs with thymine and cytosine pairs with guanine. A gene is a section of DNA that "
        "codes for one protein. Transcription copies a gene into messenger RNA inside the nucleus. "
        "In translation, ribosomes read the codons of the messenger RNA and join amino acids "
        "together to build the protein.",
    ],
    "Operating Systems": [
        "Processes and threads. A process is a running program with its own memory space. A thread "
        "is a smaller unit of execution inside a process. Threads of the same process share memory, "
        "which makes communication fast but needs synchronisation to avoid race conditions. A "
        "context switch saves the state of one process and loads the state of another. A process can "
        "be new, ready, running, waiting or terminated.",
        "CPU scheduling. The scheduler decides which ready process runs next. First come first "
        "served runs processes in arrival order and can cause the convoy effect, where short "
        "processes wait behind a long one. Shortest job first minimises the average waiting time but "
        "needs an estimate of run time and can starve long jobs. Round robin gives each process a "
        "fixed time quantum and then moves it to the back of the queue, which suits interactive "
        "systems. Priority scheduling runs the highest priority process first and uses aging to "
        "prevent starvation.",
        "Memory management. Virtual memory lets processes use more memory than is physically "
        "available. Paging divides memory into fixed size pages and frames. The page table maps "
        "virtual pages to physical frames. A page fault happens when a needed page is not in RAM, "
        "and the operating system must load it from disk. Page replacement algorithms such as least "
        "recently used decide which page to remove. Thrashing happens when the system spends more "
        "time swapping pages than running programs.",
        "Deadlocks. A deadlock happens when processes wait for each other forever. Four conditions "
        "must hold together: mutual exclusion, hold and wait, no preemption, and circular wait. "
        "Deadlocks can be prevented by breaking one condition, for example by requiring resources to "
        "be requested in a fixed order to avoid circular wait. Detection builds a resource "
        "allocation graph and looks for cycles. The banker's algorithm avoids deadlock by granting "
        "a request only if the system stays in a safe state.",
    ],
}

# (question, expected document, expected page). Phrased differently from the source text.
ANSWERABLE: list[tuple[str, str, int]] = [
    ("What is a variable?", "Intro to Programming", 1),
    ("How do statically typed and dynamically typed languages differ?", "Intro to Programming", 1),
    ("Which data type holds true or false?", "Intro to Programming", 1),
    ("When does a while loop stop repeating?", "Intro to Programming", 2),
    ("What does the break statement do inside a loop?", "Intro to Programming", 2),
    ("What is an infinite loop?", "Intro to Programming", 2),
    ("What is the base case in a recursive function?", "Intro to Programming", 3),
    ("Why can recursion lead to a stack overflow?", "Intro to Programming", 3),
    ("What is the difference between a parameter and a return value?", "Intro to Programming", 3),
    ("Which operations does a stack support?", "Intro to Programming", 4),
    ("What are queues used for in programming?", "Intro to Programming", 4),
    ("Which part of the cell contains the DNA?", "Cell Biology", 1),
    ("What do plant cells have that animal cells do not?", "Cell Biology", 1),
    ("What is the role of chlorophyll?", "Cell Biology", 2),
    ("What are the inputs and outputs of photosynthesis?", "Cell Biology", 2),
    ("Where do the light dependent reactions take place?", "Cell Biology", 2),
    ("How much ATP does aerobic respiration make per glucose?", "Cell Biology", 3),
    ("What does anaerobic respiration produce in muscle cells?", "Cell Biology", 3),
    ("What happens during glycolysis?", "Cell Biology", 3),
    ("Which DNA bases pair with each other?", "Cell Biology", 4),
    ("What is transcription?", "Cell Biology", 4),
    ("How is a process different from a thread?", "Operating Systems", 1),
    ("What is a context switch?", "Operating Systems", 1),
    ("What is the convoy effect in scheduling?", "Operating Systems", 2),
    ("How does round robin scheduling work?", "Operating Systems", 2),
    ("What is a page fault?", "Operating Systems", 3),
    ("What is thrashing?", "Operating Systems", 3),
    ("What does the page table do?", "Operating Systems", 3),
    ("What are the four conditions needed for a deadlock?", "Operating Systems", 4),
    ("How does the banker's algorithm avoid deadlock?", "Operating Systems", 4),
]

# Not covered by any document, including near-misses that sit close to a covered subject.
UNANSWERABLE: list[str] = [
    "Who painted the Mona Lisa?",
    "What is the capital city of Australia?",
    "How does mitosis differ from meiosis?",
    "What is a B-tree and when is it used in databases?",
    "Explain how TCP congestion control works",
    "What were the main causes of the First World War?",
    "How does a neural network learn from training data?",
    "What is the boiling point of water at sea level?",
]
