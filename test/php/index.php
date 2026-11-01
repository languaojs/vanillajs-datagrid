<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vanilla DataGrid Lab</title>
    <link rel="stylesheet" href="./datagrid.css">
    <style>
        :root {
            color-scheme: light;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #172033;
            background: #f3f6fb;
        }

        * { box-sizing: border-box; }

        body {
            min-width: 320px;
            min-height: 100vh;
            margin: 0;
            background:
                radial-gradient(ellipse at 12% 0%, rgba(99, 145, 255, 0.14), transparent 38rem),
                #f3f6fb;
        }

        main {
            width: min(1120px, calc(100% - 40px));
            margin: 0 auto;
            padding: 52px 0 72px;
        }

        h1 {
            margin: 0;
            color: #111a2e;
            font-size: clamp(2rem, 5vw, 2.8rem);
            letter-spacing: -0.045em;
        }

        .page-intro {
            margin: 10px 0 34px;
            color: #64708a;
            font-size: 1.05rem;
            line-height: 1.6;
        }

        .grid-card {
            margin-top: 22px;
            padding: 24px;
            overflow-x: auto;
            border: 1px solid #e0e7f1;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.94);
            box-shadow: 0 14px 40px rgba(31, 51, 83, 0.07);
        }

        .grid-card h2 {
            margin: 0;
            color: #1c2940;
            font-size: 1.15rem;
            letter-spacing: -0.02em;
        }

        .grid-card p {
            margin: 7px 0 18px;
            color: #738097;
            font-size: 0.92rem;
        }

        .grid-card table.v-dg-table {
            width: 100%;
            min-width: 560px;
            margin-top: 18px;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
            border: 1px solid #e4eaf2;
            border-radius: 10px;
            background: #fff;
        }

        .grid-card table.v-dg-table thead th {
            padding: 13px 16px;
            border-bottom: 1px solid #e0e7f1;
            background: #f5f7fb;
            color: #53617a;
            font-size: 0.76rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-align: left;
            text-transform: uppercase;
        }

        .grid-card table.v-dg-table tbody td {
            padding: 13px 16px;
            border-bottom: 1px solid #edf1f6;
            color: #33415a;
            font-size: 0.92rem;
        }

        .grid-card table.v-dg-table tbody tr:last-child td { border-bottom: 0; }
        .grid-card table.v-dg-table tbody tr:nth-child(even) { background: #fafbfd; }
        .grid-card table.v-dg-table tbody tr:hover { background: #f0f5ff; }
        .grid-card table.v-dg-table tbody td:first-child { color: #1b2c4a; font-weight: 600; }

        @media (max-width: 640px) {
            main { width: min(100% - 24px, 1120px); padding-top: 34px; }
            .grid-card { padding: 16px; border-radius: 12px; }
            .page-intro { margin-bottom: 24px; }
        }
    </style>
</head>
<body>
    <main>
        <h1>Vanilla DataGrid Lab</h1>
        <p class="page-intro">A lightweight, interactive table with search, sorting, and flexible pagination.</p>

        <section class="grid-card">
            <h2>Static data</h2>
            <p>Ten rows are shown by default; change the page size to explore the local data.</p>
            <table id="static-users" data-grid-example="local">
                <thead data-section="users">
                    <tr data-header-row="users">
                        <th data-field="name" data-sortable="true" title="User name"><span>Name</span></th>
                        <th data-field="role" data-sortable="true">Role</th>
                        <th data-field="team" data-sortable="true">Team</th>
                    </tr>
                </thead>
                <tbody data-section="user-records">
                    <tr data-user-id="ada" class="featured"><td data-field-kind="name"><strong>Ada Lovelace</strong></td><td>Engineer</td><td>Platform</td></tr>
                    <tr><td>Grace Hopper</td><td>Admiral</td><td><a href="#">Systems</a></td></tr>
                    <tr><td>Katherine Johnson</td><td>Mathematician</td><td>Research</td></tr>
                    <tr><td>Alan Turing</td><td>Cryptanalyst</td><td>Research</td></tr>
                    <tr><td>Hedy Lamarr</td><td>Inventor</td><td>Networks</td></tr>
                    <tr><td>Mary Jackson</td><td>Engineer</td><td>Aerospace</td></tr>
                    <tr><td>Radia Perlman</td><td>Engineer</td><td>Networks</td></tr>
                    <tr><td>Frances Allen</td><td>Computer scientist</td><td>Systems</td></tr>
                    <tr><td>Jean Bartik</td><td>Programmer</td><td>Computing</td></tr>
                    <tr><td>Margaret Hamilton</td><td>Engineer</td><td>Aerospace</td></tr>
                    <tr><td>Donald Knuth</td><td>Computer scientist</td><td>Research</td></tr>
                    <tr><td>Barbara Liskov</td><td>Computer scientist</td><td>Platform</td></tr>
                </tbody>
            </table>
        </section>

        <section class="grid-card">
            <h2>Ajax data</h2>
            <p>Remote rows load on demand; this example uses a configured page size with the control hidden.</p>
            <table id="remote-users">
                <thead>
                    <tr>
                        <th data-field="name" data-sortable="true">Name</th>
                        <th data-field="role" data-sortable="true">Role</th>
                        <th data-field="team" data-sortable="true">Team</th>
                    </tr>
                </thead>
            </table>
        </section>
    </main>

    <script src="./datagrid.js"></script>
    <script>
        new VanillaDataGrid('#static-users');
        new VanillaDataGrid('#remote-users', {
            ajaxUrl: './data.php',
            rowsPerPage: 5,
            showRowsPerPage: true
        });
    </script>
</body>
</html>
