ALTER TABLE questions ADD COLUMN difficulty text DEFAULT 'Medium' NOT NULL;
--> statement-breakpoint
UPDATE questions SET difficulty = 'Easy' WHERE topic IN ('Basics', 'Data types', 'Input/Output', 'Conditionals', 'Objects', 'Web basics', 'Cloud', 'Strings', 'Functions', 'Arrays');
--> statement-breakpoint
UPDATE questions SET difficulty = 'Hard' WHERE topic IN ('Recursion', 'Pointers', 'Hashing', 'Complexity', 'Normalization', 'Joins', 'Transactions', 'Boolean algebra', 'Sorting', 'Trees', 'Graph', 'Preprocessor', 'Storage', 'File handling', 'Polymorphism', 'Abstract class', 'IP Addressing', 'OSI Model', 'Flip-flops', 'Exception handling', 'Indexing', 'Linked List', 'Heap', 'Encapsulation', 'Constructors');
