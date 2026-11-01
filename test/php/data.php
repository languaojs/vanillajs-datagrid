<?php
header('Content-Type: application/json; charset=utf-8');

$rows = [
    ['Ada Lovelace', 'Engineer', 'Platform'],
    ['Grace Hopper', 'Admiral', 'Systems'],
    ['Katherine Johnson', 'Mathematician', 'Research'],
    ['Alan Turing', 'Cryptanalyst', 'Research'],
    ['Hedy Lamarr', 'Inventor', 'Networks'],
    ['Mary Jackson', 'Engineer', 'Aerospace'],
    ['Radia Perlman', 'Engineer', 'Networks'],
    ['Frances Allen', 'Computer scientist', 'Systems'],
    ['Jean Bartik', 'Programmer', 'Computing'],
    ['Margaret Hamilton', 'Engineer', 'Aerospace'],
    ['Donald Knuth', 'Computer scientist', 'Research'],
    ['Barbara Liskov', 'Computer scientist', 'Platform'],
];

$search = trim($_GET['search'] ?? '');
if ($search !== '') {
    $rows = array_values(array_filter($rows, function ($row) use ($search) {
        return stripos(implode(' ', $row), $search) !== false;
    }));
}

$total = count($rows);
$page = max(1, (int)($_GET['page'] ?? 1));
$limit = min(100, max(1, (int)($_GET['limit'] ?? 10)));
$offset = ($page - 1) * $limit;

echo json_encode([
    'total' => $total,
    'rows' => array_slice($rows, $offset, $limit),
]);
