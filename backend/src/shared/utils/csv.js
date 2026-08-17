function escapeCsvValue(value) {
    if (value === null || value === undefined){
        return "";
    }

    let stringValue = String(value);

    if (/^\s*[=+\-@]/.test(stringValue)) {
        stringValue = `'${stringValue}`;
    }

    if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n") ||
        stringValue.includes("\r")
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

function rowsToCsv(rows) {
    if(!rows || rows.length === 0){
        return "";
    }

    const headers = Object.keys(rows[0]);
    
    const csvHeaders = headers.join(",");

    const csvRows = rows.map((row) => {
        return headers.map((header) => escapeCsvValue(row[header])).join(",");
    });

    return [csvHeaders, ...csvRows].join("\n");
}

module.exports = {
    rowsToCsv,
};
