import { $, $$, onClick, onEvent, getValues, resetFields } from "./domUtils.js";

// Data storage
let transactions = []; // { id, symbol, type, shares, price, date }
let currentPrices = {}; // symbol -> latest price
// Symbol mappings: { "your_symbol": "yahoo_fetch_symbol" }
let symbolMappings = {};

// Chart variables
let portfolioChart = null;
let currentChartType = "allocation";

// Format number in Indian Rupee style (lakh, crore)
function formatIndianRupee(amount) {
	if (isNaN(amount)) return "₹0";

	let num = Math.abs(amount);
	const isNegative = amount < 0;

	// Handle crore (1 crore = 10,000,000)
	const crores = Math.floor(num / 10000000);
	num = num % 10000000;

	// Handle lakh (1 lakh = 100,000)
	const lakhs = Math.floor(num / 100000);
	num = num % 100000;

	// Handle thousands (rest)
	const thousands = Math.floor(num / 1000);
	const remainder = num % 1000;

	let formatted = "";

	if (crores > 0) {
		formatted += crores + " crore";
		if (lakhs > 0 || thousands > 0 || remainder > 0) formatted += " ";
	}

	if (lakhs > 0) {
		formatted += lakhs + " lakh";
		if (thousands > 0 || remainder > 0) formatted += " ";
	}

	if (thousands > 0) {
		formatted += thousands + " thousand";
		if (remainder > 0) formatted += " ";
	}

	if (remainder > 0 || formatted === "") {
		formatted += remainder;
	}

	// Add decimal part if exists
	const decimal = amount - Math.floor(amount);
	if (decimal > 0) {
		formatted += decimal.toFixed(2).substring(1);
	}

	return (isNegative ? "-₹" : "₹") + formatted;
}

// Alternative: Standard format with commas (Indian numbering system)
function formatIndianNumber(amount) {
	if (isNaN(amount)) return "₹0";

	let num = Math.abs(amount);
	const isNegative = amount < 0;

	// Convert to string and split integer/decimal
	let parts = num.toFixed(2).split(".");
	let integerPart = parseInt(parts[0]);
	let decimalPart = parts[1];

	// Format integer part with Indian comma system
	let integerStr = integerPart.toString();
	let lastThree = integerStr.substring(integerStr.length - 3);
	let otherNumbers = integerStr.substring(0, integerStr.length - 3);

	if (otherNumbers !== "") {
		lastThree = "," + lastThree;
	}

	let formatted =
		otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

	return (isNegative ? "-₹" : "₹") + formatted + "." + decimalPart;
}

// Use this simpler version (more reliable for all numbers)
function formatRupee(amount) {
	if (isNaN(amount)) return "₹0";

	const isNegative = amount < 0;
	let num = Math.abs(amount);

	// Format using Indian numbering system (e.g., 1,00,000 for 1 lakh)
	let numStr = num.toFixed(2);
	let parts = numStr.split(".");
	let integerPart = parts[0];
	let decimalPart = parts[1];

	// Add commas in Indian style
	let lastThree = integerPart.slice(-3);
	let otherNumbers = integerPart.slice(0, -3);

	if (otherNumbers !== "") {
		lastThree = "," + lastThree;
	}

	let formatted =
		otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

	return (isNegative ? "-₹" : "₹") + formatted + "." + decimalPart;
}

// Load from localStorage on startup
// function loadFromLocalStorage() {
// 	const savedTransactions = localStorage.getItem("portfolio_transactions");
// 	const savedPrices = localStorage.getItem("portfolio_prices");

// 	if (savedTransactions) transactions = JSON.parse(savedTransactions);
// 	if (savedPrices) currentPrices = JSON.parse(savedPrices);

// 	refreshDisplay();
// }

// function loadFromLocalStorage() {
// 	const savedTransactions = localStorage.getItem("portfolio_transactions");
// 	const savedPrices = localStorage.getItem("portfolio_prices");
// 	const savedMappings = localStorage.getItem("symbol_mappings");

// 	if (savedTransactions) transactions = JSON.parse(savedTransactions);
// 	if (savedPrices) currentPrices = JSON.parse(savedPrices);
// 	if (savedMappings) symbolMappings = JSON.parse(savedMappings);

// 	loadSymbolMappings(); // This will render the table
// 	refreshDisplay();
// }

function loadFromLocalStorage() {
	const savedTransactions = localStorage.getItem("portfolio_transactions");
	const savedPrices = localStorage.getItem("portfolio_prices");
	const savedMappings = localStorage.getItem("symbol_mappings");

	if (savedTransactions) transactions = JSON.parse(savedTransactions);
	if (savedPrices) currentPrices = JSON.parse(savedPrices);
	if (savedMappings) symbolMappings = JSON.parse(savedMappings);

	// Load mappings table (even if empty)
	renderMappingsTable();
	refreshDisplay();
}

// Save to localStorage
function saveToLocalStorage() {
	localStorage.setItem("portfolio_transactions", JSON.stringify(transactions));
	localStorage.setItem("portfolio_prices", JSON.stringify(currentPrices));
}

// Generate unique ID
function generateId() {
	return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

// Add transaction
function addTransaction(symbol, type, shares, price, date) {
	symbol = symbol.toUpperCase();
	shares = parseFloat(shares);
	price = parseFloat(price);

	// Validate
	if (!symbol || isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) {
		alert("Please fill all fields correctly");
		return false;
	}

	// Check if selling more than owned
	if (type === "sell") {
		const netShares = getNetShares(symbol);
		if (shares > netShares) {
			alert(
				`Cannot sell ${shares} shares of ${symbol}. You only own ${netShares} shares.`,
			);
			return false;
		}
	}

	const transaction = {
		id: generateId(),
		symbol,
		type,
		shares,
		price,
		date: date || new Date().toISOString().split("T")[0],
	};

	transactions.push(transaction);
	saveToLocalStorage();
	refreshDisplay();
	return true;
}

// Get net shares for a symbol
function getNetShares(symbol) {
	let netShares = 0;
	for (const t of transactions) {
		if (t.symbol === symbol) {
			if (t.type === "buy") netShares += t.shares;
			else netShares -= t.shares;
		}
	}
	return netShares;
}

// Calculate cost basis (total money spent on buys)
function getCostBasis(symbol) {
	let costBasis = 0;
	for (const t of transactions) {
		if (t.symbol === symbol && t.type === "buy") {
			costBasis += t.shares * t.price;
		}
	}
	return costBasis;
}

// Update current price
function updatePrice(symbol, newPrice) {
	symbol = symbol.toUpperCase();
	newPrice = parseFloat(newPrice);

	if (!symbol || isNaN(newPrice) || newPrice <= 0) {
		alert("Please enter valid symbol and price");
		return false;
	}

	currentPrices[symbol] = newPrice;
	saveToLocalStorage();
	refreshDisplay();
	return true;
}

// Calculate portfolio data
function getPortfolioData() {
	const holdings = new Map(); // symbol -> { netShares, costBasis, currentValue }

	// Get all unique symbols with transactions
	const symbols = [...new Set(transactions.map((t) => t.symbol))];

	for (const symbol of symbols) {
		const netShares = getNetShares(symbol);
		if (netShares <= 0) continue;

		const costBasis = getCostBasis(symbol);
		const currentPrice = currentPrices[symbol] || 0;
		const currentValue = netShares * currentPrice;

		holdings.set(symbol, {
			netShares,
			costBasis,
			currentPrice,
			currentValue,
			pl: currentValue - costBasis,
		});
	}

	return holdings;
}

// Render holdings table
function renderHoldings() {
	const holdings = getPortfolioData();
	const tbody = document.getElementById("holdingsBody");

	if (holdings.size === 0) {
		tbody.innerHTML = '<tr><td colspan="6">No active holdings</td></tr>';
		return;
	}

	tbody.innerHTML = "";
	for (const [symbol, data] of holdings) {
		const row = tbody.insertRow();
		row.insertCell(0).textContent = symbol;
		row.insertCell(1).textContent = data.netShares.toFixed(4);
		row.insertCell(2).textContent = formatRupee(
			data.costBasis / data.netShares,
		);
		row.insertCell(3).textContent = data.currentPrice
			? formatRupee(data.currentPrice)
			: "N/A";
		row.insertCell(4).textContent = formatRupee(data.currentValue);

		const plCell = row.insertCell(5);
		plCell.textContent = formatRupee(data.pl);
		plCell.className = data.pl >= 0 ? "positive" : "negative";
		if (data.pl >= 0) plCell.classList.add("positive");
		else plCell.classList.add("negative");
	}
}

// Update summary
function updateSummary() {
	const holdings = getPortfolioData();
	let totalValue = 0;
	let totalInvested = 0;

	for (const data of holdings.values()) {
		totalValue += data.currentValue;
		totalInvested += data.costBasis;
	}

	const totalPL = totalValue - totalInvested;

	document.getElementById("totalValue").textContent = formatRupee(totalValue);
	document.getElementById("totalInvested").textContent =
		formatRupee(totalInvested);
	const totalPLElem = document.getElementById("totalPL");
	totalPLElem.textContent = formatRupee(totalPL);
	totalPLElem.className = totalPL >= 0 ? "positive" : "negative";
}

// Refresh all displays
function refreshDisplay() {
	renderHoldings();
	updateSummary();
	updateBackupStatus();
	renderTransactionsHistory();
	renderChart(currentChartType);
	updateQuickStats();
}

// Export data
// function exportData() {
// 	const exportObj = {
// 		version: "1.0",
// 		exportDate: new Date().toISOString(),
// 		transactions: transactions,
// 		currentPrices: currentPrices,
// 	};

// 	const dataStr = JSON.stringify(exportObj, null, 2);
// 	const blob = new Blob([dataStr], { type: "application/json" });
// 	const url = URL.createObjectURL(blob);
// 	const a = document.createElement("a");
// 	a.href = url;
// 	a.download = `portfolio_backup_${new Date().toISOString().split("T")[0]}.json`;
// 	document.body.appendChild(a);
// 	a.click();
// 	document.body.removeChild(a);
// 	URL.revokeObjectURL(url);

// 	document.getElementById("backupStatus").innerHTML = "✅ Export completed!";
// 	setTimeout(() => updateBackupStatus(), 3000);
// }

// Export data
function exportData() {
	const exportObj = {
		version: "2.0", // Increment version to indicate mappings are included
		exportDate: new Date().toISOString(),
		transactions: transactions,
		currentPrices: currentPrices,
		symbolMappings: symbolMappings, // ADD THIS LINE
	};

	const dataStr = JSON.stringify(exportObj, null, 2);
	const blob = new Blob([dataStr], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `portfolio_backup_${new Date().toISOString().split("T")[0]}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	document.getElementById("backupStatus").innerHTML =
		"✅ Export completed (includes mappings)!";
	setTimeout(() => updateBackupStatus(), 3000);
}

// Import data
// function importData(file) {
// 	const reader = new FileReader();
// 	reader.onload = function (e) {
// 		try {
// 			const imported = JSON.parse(e.target.result);

// 			// Validate structure
// 			if (!imported.transactions || !imported.currentPrices) {
// 				throw new Error("Invalid file format");
// 			}

// 			if (
// 				confirm(
// 					`Import will replace ALL current data. Continue?\nFound ${imported.transactions.length} transactions.`,
// 				)
// 			) {
// 				transactions = imported.transactions;
// 				currentPrices = imported.currentPrices;
// 				saveToLocalStorage();
// 				refreshDisplay();
// 				document.getElementById("backupStatus").innerHTML =
// 					"✅ Import successful!";
// 				setTimeout(() => updateBackupStatus(), 3000);
// 			}
// 		} catch (error) {
// 			alert("Error importing file: " + error.message);
// 		}
// 	};
// 	reader.readAsText(file);
// }

// Import data
function importData(file) {
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const imported = JSON.parse(e.target.result);

			// Validate structure (updated to handle both v1 and v2)
			if (!imported.transactions || !imported.currentPrices) {
				throw new Error("Invalid file format: missing transactions or prices");
			}

			const transactionCount = imported.transactions.length;
			let message = `Import will replace ALL current data. Continue?\nFound ${transactionCount} transactions.`;

			// Check if mappings exist in the import
			const hasMappings =
				imported.symbolMappings &&
				Object.keys(imported.symbolMappings).length > 0;
			if (hasMappings) {
				message += `\nIncludes ${Object.keys(imported.symbolMappings).length} symbol mappings.`;
			}

			if (confirm(message)) {
				transactions = imported.transactions;
				currentPrices = imported.currentPrices;

				// Import mappings if they exist (v2 format)
				if (imported.symbolMappings) {
					symbolMappings = imported.symbolMappings;
					renderMappingsTable(); // Refresh the mappings display
				} else {
					// Old backup format - keep existing mappings or clear?
					if (
						confirm(
							"This backup does not contain symbol mappings. Keep existing mappings?",
						)
					) {
						// Keep existing symbolMappings
					} else {
						symbolMappings = {};
						renderMappingsTable();
					}
				}

				saveToLocalStorage();
				saveSymbolMappings(); // Save mappings separately
				refreshDisplay();

				document.getElementById("backupStatus").innerHTML =
					"✅ Import successful! " +
					(hasMappings ? "Mappings restored." : "No mappings in this backup.");
				setTimeout(() => updateBackupStatus(), 3000);
			}
		} catch (error) {
			alert("Error importing file: " + error.message);
		}
	};
	reader.readAsText(file);
}

// Clear all data
// function clearAllData() {
// 	if (
// 		confirm(
// 			"⚠️ WARNING: This will delete ALL transactions and prices. Are you sure?",
// 		)
// 	) {
// 		transactions = [];
// 		currentPrices = {};
// 		saveToLocalStorage();
// 		refreshDisplay();
// 		document.getElementById("backupStatus").innerHTML = "🗑️ All data cleared";
// 		setTimeout(() => updateBackupStatus(), 3000);
// 	}
// }

// Clear all data
function clearAllData() {
	if (
		confirm(
			"⚠️ WARNING: This will delete ALL transactions, prices, AND symbol mappings. Are you sure?",
		)
	) {
		transactions = [];
		currentPrices = {};
		symbolMappings = {}; // ADD THIS LINE
		saveToLocalStorage();
		saveSymbolMappings(); // ADD THIS LINE
		renderMappingsTable(); // ADD THIS LINE - refresh mappings display
		refreshDisplay();
		document.getElementById("backupStatus").innerHTML =
			"🗑️ All data cleared (including mappings)";
		setTimeout(() => updateBackupStatus(), 3000);
	}
}

// Update backup status message
function updateBackupStatus() {
	const lastBackup = localStorage.getItem("last_backup");
	if (lastBackup) {
		document.getElementById("backupStatus").innerHTML =
			`📅 Last backup: ${new Date(parseInt(lastBackup)).toLocaleString()}`;
	} else {
		document.getElementById("backupStatus").innerHTML =
			"No backup found. Use Export to save your data.";
	}
}

// Render transactions history table with filters
function renderTransactionsHistory() {
	const filterSymbol = document
		.getElementById("filterSymbol")
		.value.toUpperCase();
	const filterType = document.getElementById("filterType").value;

	// Sort transactions by date (newest first)
	let filteredTransactions = [...transactions].sort((a, b) => {
		// First compare by date
		const dateCompare = new Date(b.date) - new Date(a.date);
		if (dateCompare !== 0) return dateCompare;
		// If same date, compare by id (newer id = newer transaction)
		return b.id.localeCompare(a.id);
	});

	// Apply filters
	if (filterSymbol) {
		filteredTransactions = filteredTransactions.filter(
			(t) => t.symbol === filterSymbol,
		);
	}
	if (filterType !== "all") {
		filteredTransactions = filteredTransactions.filter(
			(t) => t.type === filterType,
		);
	}

	const tbody = document.getElementById("transactionsBody");

	if (filteredTransactions.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="7">No transactions match filters</td></tr>';
		updateTransactionStats(filteredTransactions);
		return;
	}

	tbody.innerHTML = "";
	for (const t of filteredTransactions) {
		const row = tbody.insertRow();
		row.insertCell(0).textContent = t.date;
		row.insertCell(1).textContent = t.symbol;
		row.insertCell(2).textContent = t.type.toUpperCase();
		row.insertCell(3).textContent = t.shares.toFixed(4);
		row.insertCell(4).textContent = formatRupee(t.price);
		row.insertCell(5).textContent = formatRupee(t.shares * t.price);

		// Actions cell
		const actionCell = row.insertCell(6);
		const deleteBtn = document.createElement("button");
		actionCell.className = "action-cell";

		deleteBtn.textContent = "❌";
		deleteBtn.className = "small delete-btn";
		deleteBtn.title = "Delete transaction";
		deleteBtn.onclick = () => deleteTransaction(t.id);

		const editBtn = document.createElement("button");
		editBtn.textContent = "✏️";
		editBtn.className = "small edit-btn";
		editBtn.title = "Edit transaction";
		editBtn.onclick = () => editTransaction(t.id);

		actionCell.appendChild(editBtn);
		actionCell.appendChild(deleteBtn);
	}

	updateTransactionStats(filteredTransactions);
}

// Update transaction statistics
function updateTransactionStats(transactionsList) {
	let totalBuysCount = 0;
	let totalSellsRevenue = 0;
	let totalBuysCost = 0;

	for (const t of transactionsList) {
		const total = t.shares * t.price;
		if (t.type === "buy") {
			totalBuysCount++;
			totalBuysCost += total;
		} else {
			totalSellsRevenue += total;
		}
	}

	const netCashFlow = totalSellsRevenue - totalBuysCost;

	document.getElementById("totalBuysCount").textContent = totalBuysCount;
	document.getElementById("totalSellsAmount").textContent =
		formatRupee(totalSellsRevenue);
	const netCashFlowElem = document.getElementById("netCashFlowAmount");
	netCashFlowElem.textContent = formatRupee(netCashFlow);
	netCashFlowElem.className = netCashFlow >= 0 ? "positive" : "negative";
}

// Delete a transaction
function deleteTransaction(id) {
	if (confirm("Delete this transaction? This will affect your holdings.")) {
		transactions = transactions.filter((t) => t.id !== id);
		saveToLocalStorage();
		refreshDisplay();
		renderTransactionsHistory(); // Refresh transaction table
	}
}

// Edit a transaction
function editTransaction(id) {
	const transaction = transactions.find((t) => t.id === id);
	if (!transaction) return;

	// Populate form with transaction data
	document.getElementById("symbol").value = transaction.symbol;
	document.getElementById("type").value = transaction.type;
	document.getElementById("shares").value = transaction.shares;
	document.getElementById("price").value = transaction.price;
	document.getElementById("date").value = transaction.date;

	// Delete old transaction (will add new one when user clicks Add)
	if (
		confirm("Edit this transaction? Click OK to remove it and edit the form.")
	) {
		transactions = transactions.filter((t) => t.id !== id);
		saveToLocalStorage();
		refreshDisplay();
		renderTransactionsHistory();
		document.getElementById("symbol").focus();
	}
}

// Clear filters
function clearFilters() {
	document.getElementById("filterSymbol").value = "";
	document.getElementById("filterType").value = "all";
	renderTransactionsHistory();
}

// Event listeners
// document.addEventListener("DOMContentLoaded", () => {
// 	loadFromLocalStorage();

// 	// Add transaction
// 	document.getElementById("addTransactionBtn").addEventListener("click", () => {
// 		const symbol = document.getElementById("symbol").value;
// 		const type = document.getElementById("type").value;
// 		const shares = document.getElementById("shares").value;
// 		const price = document.getElementById("price").value;
// 		const date = document.getElementById("date").value;

// 		if (addTransaction(symbol, type, shares, price, date)) {
// 			// Clear form except symbol (for quick multiple entries)
// 			document.getElementById("shares").value = "";
// 			document.getElementById("price").value = "";
// 			document.getElementById("symbol").focus();
// 		}
// 	});

// 	// Update price
// 	document.getElementById("updatePriceBtn").addEventListener("click", () => {
// 		const symbol = document.getElementById("priceSymbol").value;
// 		const newPrice = document.getElementById("newPrice").value;
// 		if (updatePrice(symbol, newPrice)) {
// 			document.getElementById("priceSymbol").value = "";
// 			document.getElementById("newPrice").value = "";
// 		}
// 	});

// 	// Export
// 	document.getElementById("exportBtn").addEventListener("click", exportData);

// 	// Import
// 	const importFileInput = document.getElementById("importFile");
// 	document.querySelector(".import-label").addEventListener("click", () => {
// 		importFileInput.click();
// 	});
// 	importFileInput.addEventListener("change", (e) => {
// 		if (e.target.files.length > 0) {
// 			importData(e.target.files[0]);
// 			importFileInput.value = ""; // Reset so same file can be imported again
// 		}
// 	});

// 	// Clear all
// 	document
// 		.getElementById("clearAllBtn")
// 		.addEventListener("click", clearAllData);

// 	// Transactions filter listeners
// 	document
// 		.getElementById("filterSymbol")
// 		.addEventListener("input", () => renderTransactionsHistory());
// 	document
// 		.getElementById("filterType")
// 		.addEventListener("change", () => renderTransactionsHistory());
// 	document
// 		.getElementById("clearFiltersBtn")
// 		.addEventListener("click", clearFilters);

// 	// Replace the existing price update event listeners with these:
// 	document.getElementById("updatePriceBtn").addEventListener("click", () => {
// 		const symbol = document.getElementById("priceSymbol").value;
// 		const newPrice = document.getElementById("newPrice").value;
// 		if (updatePrice(symbol, newPrice)) {
// 			document.getElementById("priceSymbol").value = "";
// 			document.getElementById("newPrice").value = "";
// 		}
// 	});

// 	// Fetch single price
// 	document
// 		.getElementById("fetchPriceBtn")
// 		.addEventListener("click", updateSingleWithFetch);

// 	// Batch update all holdings
// 	document
// 		.getElementById("batchUpdateBtn")
// 		.addEventListener("click", batchUpdateAllPrices);

// 	// Symbol Mapping Manager listeners
// 	document.getElementById("addMappingBtn").addEventListener("click", () => {
// 		const originalSymbol = document.getElementById("mapOriginalSymbol").value;
// 		const fetchSymbol = document.getElementById("mapFetchSymbol").value;
// 		if (addSymbolMapping(originalSymbol, fetchSymbol)) {
// 			document.getElementById("mapOriginalSymbol").value = "";
// 			document.getElementById("mapFetchSymbol").value = "";
// 			document.getElementById("mapOriginalSymbol").focus();
// 		}
// 	});

// 	document
// 		.getElementById("clearMappingsBtn")
// 		.addEventListener("click", clearAllMappings);

// 	// Chart tab switching
// 	document.querySelectorAll(".chart-tab").forEach((tab) => {
// 		tab.addEventListener("click", (e) => {
// 			document
// 				.querySelectorAll(".chart-tab")
// 				.forEach((t) => t.classList.remove("active"));
// 			tab.classList.add("active");
// 			currentChartType = tab.dataset.chart;
// 			renderChart(currentChartType);
// 		});
// 	});

// 	// Initialize charts after data loads
// 	setTimeout(() => {
// 		initCharts();
// 	}, 100);

// 	document.getElementById("mergeImportBtn").addEventListener("click", () => {
// 		document.getElementById("importFile").click();
// 		// Store a flag to know it's a merge
// 		window.isMergeImport = true;
// 	});

// 	// Modify the existing import file listener
// 	const originalImportHandler = importFileInput.onchange;
// 	importFileInput.addEventListener("change", (e) => {
// 		if (e.target.files.length > 0) {
// 			if (window.isMergeImport) {
// 				mergeImportData(e.target.files[0]);
// 				window.isMergeImport = false;
// 			} else {
// 				importData(e.target.files[0]);
// 			}
// 			importFileInput.value = "";
// 		}
// 	});
// });

document.addEventListener("DOMContentLoaded", () => {
	loadFromLocalStorage();

	// Add transaction
	onClick("addTransactionBtn", () => {
		const { symbol, type, shares, price, date } = getValues([
			"symbol",
			"type",
			"shares",
			"price",
			"date",
		]);

		if (addTransaction(symbol, type, shares, price, date)) {
			resetFields(["shares", "price"], "symbol");
		}
	});

	// Update price
	onClick("updatePriceBtn", () => {
		const { priceSymbol, newPrice } = getValues(["priceSymbol", "newPrice"]);

		if (updatePrice(priceSymbol, newPrice)) {
			resetFields(["priceSymbol", "newPrice"]);
		}
	});

	// Import / Export / Global Actions
	onClick("exportBtn", exportData);
	onClick("clearAllBtn", clearAllData);
	onClick("fetchPriceBtn", updateSingleWithFetch);
	onClick("batchUpdateBtn", batchUpdateAllPrices);
	onClick("clearMappingsBtn", clearAllMappings);

	// File Inputs
	onClick("mergeImportBtn", () => {
		$("#importFile").click();
		window.isMergeImport = true;
	});

	$(".import-label")?.addEventListener("click", () => $("#importFile").click());

	onEvent("importFile", "change", (e) => {
		if (!e.target.files.length) return;

		if (window.isMergeImport) {
			mergeImportData(e.target.files[0]);
			window.isMergeImport = false;
		} else {
			importData(e.target.files[0]);
		}
		e.target.value = "";
	});

	// Filters
	onEvent("filterSymbol", "input", renderTransactionsHistory);
	onEvent("filterType", "change", renderTransactionsHistory);
	onClick("clearFiltersBtn", clearFilters);

	// Symbol Mapping Manager
	onClick("addMappingBtn", () => {
		const { mapOriginalSymbol, mapFetchSymbol } = getValues([
			"mapOriginalSymbol",
			"mapFetchSymbol",
		]);

		if (addSymbolMapping(mapOriginalSymbol, mapFetchSymbol)) {
			resetFields(["mapOriginalSymbol", "mapFetchSymbol"], "mapOriginalSymbol");
		}
	});

	// Chart tab switching
	$$(".chart-tab").forEach((tab) => {
		tab.addEventListener("click", () => {
			$$(".chart-tab").forEach((t) => t.classList.remove("active"));
			tab.classList.add("active");
			currentChartType = tab.dataset.chart;
			renderChart(currentChartType);
		});
	});

	// Initialize charts after data loads
	setTimeout(initCharts, 100);
});

// Fetch live price from Yahoo Finance
// async function fetchLivePrice(symbol) {
// 	try {
// 		// Add .NS suffix if no exchange specified (assumes NSE for Indian stocks)
// 		let fetchSymbol = symbol;
// 		if (!symbol.includes(".") && !symbol.includes("^")) {
// 			fetchSymbol = symbol + ".NS";
// 		}

// 		const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fetchSymbol)}`;
// 		const response = await fetch(url);

// 		if (!response.ok) {
// 			throw new Error(`HTTP ${response.status}`);
// 		}

// 		const data = await response.json();
// 		const result = data.chart.result[0];

// 		if (!result) {
// 			throw new Error("No data found");
// 		}

// 		const currentPrice = result.meta.regularMarketPrice;
// 		const currency = result.meta.currency;

// 		return { price: currentPrice, currency, success: true };
// 	} catch (error) {
// 		console.error(`Fetch error for ${symbol}:`, error);
// 		return {
// 			price: null,
// 			currency: null,
// 			success: false,
// 			error: error.message,
// 		};
// 	}
// }

// Fetch live price from Yahoo Finance via CORS proxy
// async function fetchLivePrice(symbol) {
// 	try {
// 		// Add .NS suffix if no exchange specified (assumes NSE for Indian stocks)
// 		let fetchSymbol = symbol;
// 		if (!symbol.includes(".") && !symbol.includes("^")) {
// 			fetchSymbol = symbol + ".NS";
// 		}

// 		// Use CORS proxy (free, no API key)
// 		const proxyUrl = "https://api.allorigins.win/raw?url=";
// 		const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fetchSymbol)}`;
// 		const url = proxyUrl + encodeURIComponent(targetUrl);

// 		const response = await fetch(url);

// 		if (!response.ok) {
// 			throw new Error(`HTTP ${response.status}`);
// 		}

// 		const data = await response.json();
// 		const result = data.chart.result[0];

// 		if (!result) {
// 			throw new Error("No data found");
// 		}

// 		const currentPrice = result.meta.regularMarketPrice;
// 		const currency = result.meta.currency;

// 		return { price: currentPrice, currency, success: true };
// 	} catch (error) {
// 		console.error(`Fetch error for ${symbol}:`, error);
// 		return {
// 			price: null,
// 			currency: null,
// 			success: false,
// 			error: error.message,
// 		};
// 	}
// }

// Fetch live price from Yahoo Finance via working CORS proxy
// async function fetchLivePrice(symbol) {
// 	try {
// 		// Add .NS suffix if no exchange specified (assumes NSE for Indian stocks)
// 		let fetchSymbol = symbol;
// 		if (!symbol.includes(".") && !symbol.includes("^")) {
// 			fetchSymbol = symbol + ".NS";
// 		}

// 		// Use corsproxy.io - works with Yahoo Finance
// 		const proxyUrl = "https://corsproxy.io/?";
// 		const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fetchSymbol)}`;
// 		const url = proxyUrl + encodeURIComponent(targetUrl);

// 		console.log("Fetching:", url); // For debugging

// 		const response = await fetch(url);

// 		if (!response.ok) {
// 			throw new Error(`HTTP ${response.status}`);
// 		}

// 		const data = await response.json();
// 		const result = data.chart.result[0];

// 		if (!result) {
// 			throw new Error("No data found");
// 		}

// 		const currentPrice = result.meta.regularMarketPrice;
// 		const currency = result.meta.currency;

// 		return { price: currentPrice, currency, success: true };
// 	} catch (error) {
// 		console.error(`Fetch error for ${symbol}:`, error);
// 		return {
// 			price: null,
// 			currency: null,
// 			success: false,
// 			error: error.message,
// 		};
// 	}
// }

// Fetch live price from Yahoo Finance using symbol mappings
// async function fetchLivePrice(symbol) {
// 	try {
// 		// Get the correct fetch symbol from mappings or generate default
// 		const fetchSymbol = getFetchSymbol(symbol);

// 		console.log(`Fetching ${symbol} as ${fetchSymbol}`); // Debug log

// 		const statusDiv = document.getElementById("fetchStatus");

// 		if (statusDiv) {
// 			statusDiv.innerHTML = `⏳ Fetching ${fetchSymbol}...`;
// 		}

// 		// Try multiple CORS proxies
// 		const proxies = [
// 			"https://corsproxy.io/?",
// 			"https://thingproxy.freeboard.io/fetch/",
// 		];

// 		for (const proxy of proxies) {
// 			try {
// 				const url =
// 					proxy +
// 					`https://query1.finance.yahoo.com/v8/finance/chart/${fetchSymbol}`;
// 				const response = await fetch(url, {
// 					method: "GET",
// 					headers: {
// 						"Content-Type": "application/json",
// 					},
// 				});

// 				if (response.ok) {
// 					const data = await response.json();
// 					const result = data.chart.result[0];

// 					if (result && result.meta && result.meta.regularMarketPrice) {
// 						const currentPrice = result.meta.regularMarketPrice;
// 						const currency = result.meta.currency;

// 						if (statusDiv && fetchSymbol !== symbol) {
// 							statusDiv.innerHTML = `✅ ${symbol} → ${fetchSymbol}: ${formatRupee(currentPrice)}`;
// 							setTimeout(() => {
// 								if (statusDiv.innerHTML.includes("→")) {
// 									statusDiv.innerHTML = "";
// 								}
// 							}, 3000);
// 						}

// 						return {
// 							price: currentPrice,
// 							currency,
// 							success: true,
// 							usedSymbol: fetchSymbol,
// 						};
// 					}
// 				}
// 			} catch (e) {
// 				continue; // Try next proxy
// 			}
// 		}

// 		throw new Error(`Could not fetch ${fetchSymbol}`);
// 	} catch (error) {
// 		console.error(`Fetch error for ${symbol}:`, error);
// 		return {
// 			price: null,
// 			currency: null,
// 			success: false,
// 			error: `Failed to fetch ${symbol}. Check mapping or use format like TATAPOWER.NS`,
// 		};
// 	}
// }

// Fetch live price from Yahoo Finance
// async function fetchLivePrice(symbol) {
// 	try {
// 		// Get the fetch symbol (already handles mappings)
// 		let fetchSymbol = getFetchSymbol(symbol);

// 		console.log(`Original symbol: ${symbol}, Fetch symbol: ${fetchSymbol}`);

// 		const statusDiv = document.getElementById("fetchStatus");

// 		if (statusDiv) {
// 			statusDiv.innerHTML = `⏳ Fetching ${fetchSymbol}...`;
// 		}

// 		// Use a reliable CORS proxy
// 		const proxyUrl = "https://corsproxy.io/?";
// 		const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fetchSymbol}`;
// 		const fullUrl = proxyUrl + encodeURIComponent(targetUrl);

// 		console.log(`Request URL: ${fullUrl}`);

// 		const response = await fetch(fullUrl);

// 		console.log(`Response status: ${response.status}`);

// 		if (!response.ok) {
// 			throw new Error(`HTTP ${response.status}`);
// 		}

// 		const data = await response.json();
// 		console.log("Response data structure:", Object.keys(data));

// 		// Extract price - using the correct path
// 		const chartResult = data.chart?.result?.[0];

// 		if (!chartResult) {
// 			console.error("No chart result in response:", data);
// 			throw new Error("No chart data found");
// 		}

// 		// Get price from meta
// 		let price = chartResult.meta?.regularMarketPrice;
// 		let priceSource = "live";

// 		if (!price || price === null) {
// 			price = chartResult.meta?.previousClose;
// 			priceSource = "previous close";
// 		}

// 		if (!price || price === null) {
// 			console.error("No price found in response:", chartResult.meta);
// 			throw new Error("No price data available");
// 		}

// 		const currency = chartResult.meta?.currency || "INR";

// 		console.log(`Price extracted: ${price} (${priceSource})`);

// 		if (statusDiv) {
// 			statusDiv.innerHTML = `✅ ${symbol} → ${fetchSymbol}: ${formatRupee(price)} (${priceSource})`;
// 			setTimeout(() => {
// 				if (statusDiv.innerHTML && statusDiv.innerHTML.includes("✅")) {
// 					statusDiv.innerHTML = "";
// 				}
// 			}, 3000);
// 		}

// 		return {
// 			price: price,
// 			currency: currency,
// 			success: true,
// 			usedSymbol: fetchSymbol,
// 			source: priceSource,
// 		};
// 	} catch (error) {
// 		console.error(`Fetch error for ${symbol}:`, error);

// 		if (document.getElementById("fetchStatus")) {
// 			const statusDiv = document.getElementById("fetchStatus");
// 			statusDiv.innerHTML = `❌ Error: ${error.message}`;
// 			statusDiv.style.color = "#e74c3c";
// 		}

// 		return {
// 			price: null,
// 			currency: null,
// 			success: false,
// 			error: error.message,
// 		};
// 	}
// }

// Fetch live price from Yahoo Finance
async function fetchLivePrice(symbol) {
	try {
		// Get the fetch symbol
		let fetchSymbol = getFetchSymbol(symbol);

		console.log(`Fetching: ${fetchSymbol}`);

		const statusDiv = document.getElementById("fetchStatus");

		if (statusDiv) {
			statusDiv.innerHTML = `⏳ Fetching ${fetchSymbol}...`;
		}

		// Multiple proxy options - try each until one works
		const proxyOptions = [
			{
				url: "https://api.allorigins.win/raw?url=",
				buildUrl: (target) =>
					"https://api.allorigins.win/raw?url=" + encodeURIComponent(target),
			},
			{
				url: "https://cors-anywhere.herokuapp.com/",
				buildUrl: (target) => "https://cors-anywhere.herokuapp.com/" + target,
			},
			{
				url: "https://corsproxy.io/?",
				buildUrl: (target) =>
					"https://corsproxy.io/?" + encodeURIComponent(target),
			},
		];

		let lastError = null;

		for (const proxy of proxyOptions) {
			try {
				const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fetchSymbol}`;
				const fullUrl = proxy.buildUrl(targetUrl);

				console.log(`Trying proxy: ${proxy.url}`);

				const response = await fetch(fullUrl, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
				});

				if (response.ok) {
					const data = await response.json();
					const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
					const prevClose = data.chart?.result?.[0]?.meta?.previousClose;
					const currency = data.chart?.result?.[0]?.meta?.currency || "INR";

					let finalPrice = price;
					let source = "live";

					if (!finalPrice && prevClose) {
						finalPrice = prevClose;
						source = "previous close";
					}

					if (finalPrice && finalPrice > 0) {
						if (statusDiv) {
							statusDiv.innerHTML = `✅ ${symbol}: ${formatRupee(finalPrice)} (${source})`;
							setTimeout(() => {
								if (statusDiv.innerHTML && statusDiv.innerHTML.includes("✅")) {
									statusDiv.innerHTML = "";
								}
							}, 3000);
						}

						return {
							price: finalPrice,
							currency,
							success: true,
							usedSymbol: fetchSymbol,
							source: source,
						};
					}
				} else {
					console.log(`Proxy ${proxy.url} returned ${response.status}`);
					lastError = `HTTP ${response.status}`;
				}
			} catch (e) {
				console.log(`Proxy ${proxy.url} failed:`, e.message);
				lastError = e.message;
				continue;
			}
		}

		throw new Error(lastError || "All proxies failed");
	} catch (error) {
		console.error(`Fetch error for ${symbol}:`, error);

		if (document.getElementById("fetchStatus")) {
			const statusDiv = document.getElementById("fetchStatus");
			statusDiv.innerHTML = `❌ ${symbol}: ${error.message}`;
			statusDiv.style.color = "#e74c3c";
		}

		return {
			price: null,
			currency: null,
			success: false,
			error: error.message,
		};
	}
}

// Update all holdings with live prices
// async function batchUpdateAllPrices() {
// 	const holdings = getPortfolioData();
// 	const symbols = Array.from(holdings.keys());

// 	if (symbols.length === 0) {
// 		alert("No active holdings to update");
// 		return;
// 	}

// 	const statusDiv = document.getElementById("fetchStatus");
// 	const progressDiv = document.getElementById("batchProgress");

// 	statusDiv.innerHTML = `⚠️ Starting batch update for ${symbols.length} symbols...`;
// 	statusDiv.style.color = "#f39c12";
// 	progressDiv.innerHTML = "";

// 	let updated = 0;
// 	let failed = 0;
// 	const failedSymbols = [];

// 	for (let i = 0; i < symbols.length; i++) {
// 		const symbol = symbols[i];
// 		progressDiv.innerHTML = `📊 Progress: ${i + 1}/${symbols.length} - Fetching ${symbol}...`;

// 		const result = await fetchLivePrice(symbol);

// 		if (result.success && result.price !== null) {
// 			currentPrices[symbol] = result.price;
// 			updated++;
// 			statusDiv.innerHTML = `✅ Updated ${symbol}: ${formatRupee(result.price)} (${result.currency})`;
// 			statusDiv.style.color = "#27ae60";
// 		} else {
// 			failed++;
// 			failedSymbols.push(symbol);
// 			statusDiv.innerHTML = `❌ Failed ${symbol}: ${result.error || "Unknown error"}`;
// 			statusDiv.style.color = "#e74c3c";
// 		}

// 		// Small delay to avoid rate limiting (500ms between requests)
// 		await new Promise((resolve) => setTimeout(resolve, 500));

// 		// Update progress status
// 		progressDiv.innerHTML = `📊 Progress: ${i + 1}/${symbols.length} - ${updated} updated, ${failed} failed`;
// 	}

// 	// Save and refresh
// 	saveToLocalStorage();
// 	refreshDisplay();

// 	// Final summary
// 	let summary = `✅ Batch update complete! Updated: ${updated}, Failed: ${failed}`;
// 	if (failedSymbols.length > 0) {
// 		summary += `\nFailed symbols: ${failedSymbols.join(", ")}`;
// 		summary += `\n\nTip: Add .NS for NSE stocks (e.g., ${failedSymbols[0]}.NS) or .BO for BSE`;
// 	}

// 	statusDiv.innerHTML = summary.replace(/\n/g, "<br>");
// 	progressDiv.innerHTML = "";

// 	if (updated > 0) {
// 		setTimeout(() => {
// 			if (statusDiv.innerHTML.includes("complete")) {
// 				statusDiv.innerHTML = "";
// 			}
// 		}, 8000);
// 	}
// }

// Update all holdings with live prices (updated to show mappings)
async function batchUpdateAllPrices() {
	const holdings = getPortfolioData();
	const symbols = Array.from(holdings.keys());

	if (symbols.length === 0) {
		alert("No active holdings to update");
		return;
	}

	const statusDiv = document.getElementById("fetchStatus");
	const progressDiv = document.getElementById("batchProgress");

	statusDiv.innerHTML = `⚠️ Starting batch update for ${symbols.length} symbols...`;
	statusDiv.style.color = "#f39c12";
	progressDiv.innerHTML = "";

	let updated = 0;
	let failed = 0;
	const failedSymbols = [];

	for (let i = 0; i < symbols.length; i++) {
		const symbol = symbols[i];
		const fetchSymbol = getFetchSymbol(symbol);
		const hasMapping = symbolMappings[symbol] ? "📌 mapped" : "🔍 default";

		progressDiv.innerHTML = `📊 Progress: ${i + 1}/${symbols.length} - ${symbol} ${hasMapping}...`;

		const result = await fetchLivePrice(symbol);

		if (result.success && result.price !== null) {
			currentPrices[symbol] = result.price;
			updated++;
			statusDiv.innerHTML = `✅ ${symbol}: ${formatRupee(result.price)} (via ${result.usedSymbol})`;
			statusDiv.style.color = "#27ae60";
		} else {
			failed++;
			failedSymbols.push(`${symbol} → ${fetchSymbol}`);
			statusDiv.innerHTML = `❌ ${symbol}: ${result.error}`;
			statusDiv.style.color = "#e74c3c";
		}

		// Delay to avoid rate limiting
		await new Promise((resolve) => setTimeout(resolve, 800));

		progressDiv.innerHTML = `📊 Progress: ${i + 1}/${symbols.length} - ✅ ${updated} | ❌ ${failed}`;
	}

	// Save and refresh
	saveToLocalStorage();
	refreshDisplay();

	// Final summary
	let summary = `✅ Batch update complete! Updated: ${updated}, Failed: ${failed}`;

	if (failedSymbols.length > 0) {
		summary += `\n\n❌ Failed: ${failedSymbols.join(", ")}`;
		summary += `\n\n💡 Add mappings in "Symbol Mapping Manager" for these symbols`;
	}

	statusDiv.innerHTML = summary.replace(/\n/g, "<br>");
	progressDiv.innerHTML = "";

	setTimeout(() => {
		if (statusDiv.innerHTML.includes("complete")) {
			statusDiv.innerHTML = "";
		}
	}, 8000);
}

// Update single symbol (modified to work with batch update)
async function updateSingleWithFetch() {
	const symbolInput = document.getElementById("priceSymbol");
	let symbol = symbolInput.value.trim();

	if (!symbol) {
		alert("Please enter a symbol");
		return;
	}

	const statusDiv = document.getElementById("fetchStatus");
	statusDiv.innerHTML = `⏳ Fetching ${symbol}...`;
	statusDiv.style.color = "#666";

	const result = await fetchLivePrice(symbol);

	if (result.success && result.price !== null) {
		document.getElementById("newPrice").value = result.price;
		statusDiv.innerHTML = `✅ Fetched ${symbol}: ${formatRupee(result.price)} (${result.currency})`;
		statusDiv.style.color = "#27ae60";

		if (confirm(`Update ${symbol} to ${formatRupee(result.price)}?`)) {
			updatePrice(symbol, result.price);
		}
	} else {
		statusDiv.innerHTML = `❌ Failed to fetch ${symbol}: ${result.error || "Unknown error"}`;
		statusDiv.style.color = "#e74c3c";
	}
}

// Load symbol mappings from localStorage
function loadSymbolMappings() {
	const savedMappings = localStorage.getItem("symbol_mappings");
	if (savedMappings) {
		symbolMappings = JSON.parse(savedMappings);
	} else {
		symbolMappings = {};
	}
	renderMappingsTable();
}

// Save symbol mappings to localStorage
function saveSymbolMappings() {
	localStorage.setItem("symbol_mappings", JSON.stringify(symbolMappings));
	renderMappingsTable();
}

// Add or update a symbol mapping
function addSymbolMapping(originalSymbol, fetchSymbol) {
	originalSymbol = originalSymbol.toUpperCase().trim();
	fetchSymbol = fetchSymbol.toUpperCase().trim();

	if (!originalSymbol || !fetchSymbol) {
		alert("Please enter both symbols");
		return false;
	}

	symbolMappings[originalSymbol] = fetchSymbol;
	saveSymbolMappings();
	refreshDisplay(); // Refresh to update prices with new mapping
	return true;
}

// Remove a symbol mapping
function removeSymbolMapping(originalSymbol) {
	if (confirm(`Remove mapping for ${originalSymbol}?`)) {
		delete symbolMappings[originalSymbol];
		saveSymbolMappings();
		refreshDisplay();
	}
}

// Clear all mappings
function clearAllMappings() {
	if (confirm("Clear ALL symbol mappings? This cannot be undone.")) {
		symbolMappings = {};
		saveSymbolMappings();
		refreshDisplay();
	}
}

// Get fetch symbol for a given portfolio symbol (with default logic)
function getFetchSymbol(portfolioSymbol) {
	const originalSymbol = portfolioSymbol.toUpperCase().trim();

	// Check if there's a custom mapping
	if (symbolMappings[originalSymbol]) {
		return symbolMappings[originalSymbol];
	}

	// Default logic: add .NS for NSE
	if (!originalSymbol.includes(".") && !originalSymbol.includes("^")) {
		return originalSymbol + ".NS";
	}

	return originalSymbol;
}

// Render mappings table
function renderMappingsTable() {
	const tbody = document.getElementById("mappingsBody");
	const mappingsList = Object.entries(symbolMappings);

	if (mappingsList.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="3">No mappings configured. Using defaults (.NS for NSE)</td></tr>';
		return;
	}

	tbody.innerHTML = "";
	for (const [original, fetchSymbol] of mappingsList) {
		const row = tbody.insertRow();
		row.insertCell(0).textContent = original;
		row.insertCell(1).textContent = fetchSymbol;

		const actionCell = row.insertCell(2);
		actionCell.className = "action-cell";
		const deleteBtn = document.createElement("button");
		deleteBtn.textContent = "❌";
		deleteBtn.title = "Delete mapping";
		deleteBtn.className = "small delete-btn";
		deleteBtn.onclick = () => removeSymbolMapping(original);
		actionCell.appendChild(deleteBtn);
	}
}

// Calculate historical portfolio value (for growth chart)
function calculateHistoricalValues() {
	if (transactions.length === 0) return { dates: [], values: [] };

	// Sort transactions by date
	const sortedTransactions = [...transactions].sort(
		(a, b) => new Date(a.date) - new Date(b.date),
	);

	const dateMap = new Map(); // date -> { symbol -> netShares }
	const allDates = [];

	// Track cumulative holdings per date
	let cumulativeHoldings = {};

	for (const t of sortedTransactions) {
		const date = t.date;

		// Update cumulative holdings
		if (!cumulativeHoldings[t.symbol]) {
			cumulativeHoldings[t.symbol] = 0;
		}

		if (t.type === "buy") {
			cumulativeHoldings[t.symbol] += t.shares;
		} else {
			cumulativeHoldings[t.symbol] -= t.shares;
		}

		// Store snapshot
		dateMap.set(date, { ...cumulativeHoldings });
		allDates.push(date);
	}

	// Calculate portfolio value for each date using current prices (or historical if available)
	const dates = [];
	const values = [];

	for (const date of allDates) {
		const holdings = dateMap.get(date);
		let totalValue = 0;

		for (const [symbol, shares] of Object.entries(holdings)) {
			if (shares > 0) {
				const price = currentPrices[symbol] || 0;
				totalValue += shares * price;
			}
		}

		if (totalValue > 0) {
			dates.push(date);
			values.push(totalValue);
		}
	}

	return { dates, values };
}

// Calculate allocation data for pie chart
function getAllocationData() {
	const holdings = getPortfolioData();
	const allocation = [];
	const colors = [
		"#3498db",
		"#e74c3c",
		"#2ecc71",
		"#f39c12",
		"#9b59b6",
		"#1abc9c",
		"#e67e22",
		"#34495e",
		"#16a085",
		"#27ae60",
		"#2980b9",
		"#8e44ad",
		"#2c3e50",
		"#d35400",
		"#c0392b",
	];

	let index = 0;
	for (const [symbol, data] of holdings) {
		if (data.currentValue > 0) {
			allocation.push({
				symbol: symbol,
				value: data.currentValue,
				color: colors[index % colors.length],
			});
			index++;
		}
	}

	return allocation;
}

// Get top holdings for bar chart
function getTopHoldings() {
	const holdings = getPortfolioData();
	const sorted = Array.from(holdings.entries())
		.filter(([_, data]) => data.currentValue > 0)
		.sort((a, b) => b[1].currentValue - a[1].currentValue)
		.slice(0, 5);

	return {
		labels: sorted.map(([symbol]) => symbol),
		values: sorted.map(([_, data]) => data.currentValue),
	};
}

// Render chart based on type
async function renderChart(type) {
	const canvas = document.getElementById("portfolioChart");
	if (!canvas) return;

	const ctx = canvas.getContext("2d");

	// Destroy existing chart
	if (portfolioChart) {
		portfolioChart.destroy();
	}

	if (type === "allocation") {
		const allocation = getAllocationData();

		if (allocation.length === 0) {
			ctx.fillStyle = "#999";
			ctx.font = "14px Arial";
			ctx.fillText(
				"No holdings to display",
				canvas.width / 2 - 80,
				canvas.height / 2,
			);
			return;
		}

		portfolioChart = new Chart(ctx, {
			type: "pie",
			data: {
				labels: allocation.map((a) => `${a.symbol} (${formatRupee(a.value)})`),
				datasets: [
					{
						data: allocation.map((a) => a.value),
						backgroundColor: allocation.map((a) => a.color),
						borderWidth: 2,
						borderColor: "#fff",
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: true,
				plugins: {
					legend: {
						position: "right",
						labels: {
							font: { size: 11 },
						},
					},
					tooltip: {
						callbacks: {
							label: function (context) {
								const label = context.label || "";
								const value = context.raw;
								const total = context.dataset.data.reduce((a, b) => a + b, 0);
								const percentage = ((value / total) * 100).toFixed(1);
								return `${label}: ${formatRupee(value)} (${percentage}%)`;
							},
						},
					},
				},
			},
		});
	} else if (type === "growth") {
		const { dates, values } = calculateHistoricalValues();

		if (dates.length === 0) {
			ctx.fillStyle = "#999";
			ctx.font = "14px Arial";
			ctx.fillText(
				"Not enough transaction history",
				canvas.width / 2 - 100,
				canvas.height / 2,
			);
			return;
		}

		portfolioChart = new Chart(ctx, {
			type: "line",
			data: {
				labels: dates,
				datasets: [
					{
						label: "Portfolio Value",
						data: values,
						borderColor: "#3498db",
						backgroundColor: "rgba(52, 152, 219, 0.1)",
						borderWidth: 2,
						fill: true,
						tension: 0.4,
						pointRadius: 3,
						pointHoverRadius: 5,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: true,
				plugins: {
					tooltip: {
						callbacks: {
							label: function (context) {
								return `Value: ${formatRupee(context.raw)}`;
							},
						},
					},
				},
				scales: {
					y: {
						ticks: {
							callback: function (value) {
								return formatRupee(value);
							},
						},
					},
				},
			},
		});
	} else if (type === "holdings") {
		const topHoldings = getTopHoldings();

		if (topHoldings.labels.length === 0) {
			ctx.fillStyle = "#999";
			ctx.font = "14px Arial";
			ctx.fillText(
				"No holdings to display",
				canvas.width / 2 - 80,
				canvas.height / 2,
			);
			return;
		}

		portfolioChart = new Chart(ctx, {
			type: "bar",
			data: {
				labels: topHoldings.labels,
				datasets: [
					{
						label: "Current Value",
						data: topHoldings.values,
						backgroundColor: "#3498db",
						borderRadius: 4,
						borderWidth: 0,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: true,
				plugins: {
					tooltip: {
						callbacks: {
							label: function (context) {
								return `Value: ${formatRupee(context.raw)}`;
							},
						},
					},
				},
				scales: {
					y: {
						ticks: {
							callback: function (value) {
								return formatRupee(value);
							},
						},
					},
				},
			},
		});
	}
}

// Initialize charts
function initCharts() {
	const activeTab = document.querySelector(".chart-tab.active");
	if (activeTab) {
		renderChart(activeTab.dataset.chart);
	} else {
		renderChart("allocation");
	}
}

function updateQuickStats() {
	const holdings = getPortfolioData();
	const holdingCount = holdings.size;
	document.getElementById("holdingCount").textContent = holdingCount;

	// Find best and worst performers
	let bestPL = -Infinity;
	let worstPL = Infinity;
	let bestSymbol = "-";
	let worstSymbol = "-";
	let totalReturn = 0;

	for (const [symbol, data] of holdings) {
		const returnPct = data.costBasis > 0 ? (data.pl / data.costBasis) * 100 : 0;
		totalReturn += returnPct;

		if (data.pl > bestPL) {
			bestPL = data.pl;
			bestSymbol = symbol;
		}
		if (data.pl < worstPL) {
			worstPL = data.pl;
			worstSymbol = symbol;
		}
	}

	document.getElementById("bestPerformer").innerHTML =
		`${bestSymbol}<br><small>${formatRupee(bestPL)}</small>`;
	document.getElementById("worstPerformer").innerHTML =
		`${worstSymbol}<br><small>${formatRupee(worstPL)}</small>`;

	const avgReturn =
		holdingCount > 0 ? (totalReturn / holdingCount).toFixed(2) : 0;
	document.getElementById("avgReturn").innerHTML = `${avgReturn}%`;
}

// Merge imported data with existing (instead of replace)
function mergeImportData(file) {
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const imported = JSON.parse(e.target.result);

			if (!imported.transactions) {
				throw new Error("Invalid file format");
			}

			const newTransactions = imported.transactions.length;
			const newMappings = imported.symbolMappings
				? Object.keys(imported.symbolMappings).length
				: 0;

			if (
				confirm(
					`Merge ${newTransactions} transactions and ${newMappings} mappings?\nExisting data will be kept.`,
				)
			) {
				// Merge transactions (avoid duplicates by ID)
				const existingIds = new Set(transactions.map((t) => t.id));
				const addedTransactions = imported.transactions.filter(
					(t) => !existingIds.has(t.id),
				);
				transactions = [...transactions, ...addedTransactions];

				// Merge prices
				currentPrices = { ...currentPrices, ...imported.currentPrices };

				// Merge mappings
				if (imported.symbolMappings) {
					symbolMappings = { ...symbolMappings, ...imported.symbolMappings };
					renderMappingsTable();
				}

				saveToLocalStorage();
				saveSymbolMappings();
				refreshDisplay();

				document.getElementById("backupStatus").innerHTML =
					`✅ Merged: ${addedTransactions.length} new transactions, ${newMappings} mappings added.`;
				setTimeout(() => updateBackupStatus(), 3000);
			}
		} catch (error) {
			alert("Error merging file: " + error.message);
		}
	};
	reader.readAsText(file);
}

// Scroll to section function
function scrollToSection(sectionId) {
	const element = document.getElementById(sectionId);
	if (element) {
		element.scrollIntoView({ behavior: "smooth", block: "start" });
	}
}

// Show help modal
function showHelp() {
	const modal = document.getElementById("helpModal");
	const helpContent = document.getElementById("helpContent");

	helpContent.innerHTML = `
        <h3>📊 Getting Started</h3>
        <p>Stock Portfolio Manager helps you track your investments, monitor performance, and make informed decisions.</p>
        
        <h3>➕ Adding Transactions</h3>
        <p>Enter the stock symbol, select Buy/Sell, specify shares, price per share, and date. Click "Add Transaction" to record the trade.</p>
        
        <h3>💰 Updating Prices</h3>
        <p>You can update prices in two ways:</p>
        <ul>
            <li><strong>Manual Update:</strong> Enter symbol and price, click "Manual Update"</li>
            <li><strong>Auto Fetch:</strong> Click "Fetch Single" for one stock or "Update All Holdings" for all stocks</li>
        </ul>
        
        <h3>🔧 Symbol Mapping</h3>
        <p>If a stock symbol doesn't fetch automatically, use the Symbol Mapping Manager to map your symbol to the correct Yahoo Finance symbol.</p>
        <p>Example: Map "TATASILV" to "TATSILV.NS" for Tata Silver ETF</p>
        
        <h3>📈 Understanding Charts</h3>
        <ul>
            <li><strong>Allocation:</strong> Shows percentage breakdown of your portfolio</li>
            <li><strong>Growth:</strong> Tracks portfolio value over time</li>
            <li><strong>Top Holdings:</strong> Displays your 5 largest positions</li>
        </ul>
        
        <h3>💾 Backup & Restore</h3>
        <p>Regularly export your data as JSON backup. Use Import to restore from backup or transfer data between devices.</p>
        
        <h3>🎯 Tips for Best Results</h3>
        <ul>
            <li>Use .NS suffix for NSE stocks (e.g., RELIANCE.NS)</li>
            <li>Use .BO suffix for BSE stocks (e.g., RELIANCE.BO)</li>
            <li>Export backup before major changes</li>
            <li>Update prices regularly for accurate portfolio value</li>
            <li>Use symbol mappings for hard-to-find tickers</li>
        </ul>
    `;

	modal.style.display = "block";
}

// // Show keyboard shortcuts
// function showKeyboardShortcuts() {
// 	const modal = document.getElementById("helpModal");
// 	const helpContent = document.getElementById("helpContent");

// 	helpContent.innerHTML = `
//         <h3>⌨️ Keyboard Shortcuts</h3>
//         <div class="shortcut-grid">
//             <div class="shortcut-item">
//                 <span>Add Transaction</span>
//                 <span class="shortcut-key">Ctrl + N</span>
//             </div>
//             <div class="shortcut-item">
//                 <span>Update All Prices</span>
//                 <span class="shortcut-key">Ctrl + U</span>
//             </div>
//             <div class="shortcut-item">
//                 <span>Export Data</span>
//                 <span class="shortcut-key">Ctrl + E</span>
//             </div>
//             <div class="shortcut-item">
//                 <span>Focus Symbol Input</span>
//                 <span class="shortcut-key">Ctrl + F</span>
//             </div>
//             <div class="shortcut-item">
//                 <span>Refresh View</span>
//                 <span class="shortcut-key">F5</span>
//             </div>
//             <div class="shortcut-item">
//                 <span>Open Help</span>
//                 <span class="shortcut-key">F1</span>
//             </div>
//         </div>

//         <h3>📝 Form Shortcuts</h3>
//         <ul>
//             <li><strong>Enter</strong> - Submit current form</li>
//             <li><strong>Tab</strong> - Move to next field</li>
//             <li><strong>Esc</strong> - Clear form (when focused)</li>
//         </ul>

//         <h3>🔍 Navigation Tips</h3>
//         <ul>
//             <li>Click section links in footer to jump to specific areas</li>
//             <li>Use the symbol discovery tool to find correct Yahoo symbols</li>
//             <li>Filter transactions by symbol, type, or date range</li>
//         </ul>
//     `;

// 	modal.style.display = "block";
// }

// Show symbol guide
function showSymbolGuide() {
	const modal = document.getElementById("helpModal");
	const helpContent = document.getElementById("helpContent");

	helpContent.innerHTML = `
        <h3>🔍 Yahoo Finance Symbol Guide</h3>
        
        <h4>Indian Stocks (NSE)</h4>
        <p>Add <code>.NS</code> suffix to NSE symbols:</p>
        <ul>
            <li><code>RELIANCE.NS</code> - Reliance Industries</li>
            <li><code>TCS.NS</code> - Tata Consultancy Services</li>
            <li><code>HDFCBANK.NS</code> - HDFC Bank</li>
            <li><code>INFY.NS</code> - Infosys</li>
            <li><code>TATAPOWER.NS</code> - Tata Power</li>
        </ul>
        
        <h4>Indian Stocks (BSE)</h4>
        <p>Add <code>.BO</code> suffix to BSE symbols:</p>
        <ul>
            <li><code>RELIANCE.BO</code> - Reliance Industries (BSE)</li>
            <li><code>TCS.BO</code> - Tata Consultancy Services (BSE)</li>
        </ul>
        
        <h4>ETFs (Exchange Traded Funds)</h4>
        <ul>
            <li><code>SILVER.NS</code> - Nippon India Silver ETF</li>
            <li><code>TATSILV.NS</code> - Tata Silver ETF</li>
            <li><code>TATAGOLD.NS</code> - Tata Gold ETF</li>
        </ul>
        
        <h4>Finding Correct Symbols</h4>
        <ol>
            <li>Go to <a href="https://finance.yahoo.com" target="_blank">finance.yahoo.com</a></li>
            <li>Search for your stock/ETF</li>
            <li>Copy the symbol from the URL or page</li>
            <li>Add mapping in Symbol Mapping Manager</li>
        </ol>
        
        <h4>Common Issues & Solutions</h4>
        <ul>
            <li><strong>404 Error:</strong> Symbol doesn't exist - check spelling and exchange suffix</li>
            <li><strong>No price data:</strong> Market may be closed - uses previous close</li>
            <li><strong>Wrong price:</strong> Use symbol mapping to correct</li>
        </ul>
    `;

	modal.style.display = "block";
}

// Show about modal
function showAbout() {
	const modal = document.getElementById("helpModal");
	const helpContent = document.getElementById("helpContent");

	helpContent.innerHTML = `
        <h3>ℹ️ About Stock Portfolio Manager</h3>
        
        <p><strong>Version:</strong> 2.0</p>
        <p><strong>Creator:</strong> Subodh Singh</p>
        <p><strong>Send feature requests, comments and suggestions to:</strong> zephaniahsingh@yahoo.com</p>
        <p><strong>Release Date:</strong> May 2026</p>
        
        <h4>Features</h4>
        <ul>
            <li>✓ Track buy/sell transactions</li>
            <li>✓ Automatic price fetching from Yahoo Finance</li>
            <li>✓ Indian Rupee formatting (lakh/crore)</li>
            <li>✓ Portfolio charts and analytics</li>
            <li>✓ Symbol mapping for custom tickers</li>
            <li>✓ Export/Import data backup</li>
        </ul>
        
        <h4>Data Sources</h4>
        <ul>
            <li><strong>Yahoo Finance:</strong> Stock prices and historical data</li>
            <li><strong>Local Storage:</strong> Your data stays on your device</li>
        </ul>
        
        <h4>Privacy</h4>
        <p>All your portfolio data is stored locally in your browser. No data is sent to any external server except when fetching stock prices directly from Yahoo Finance.</p>
        
        <h4>Disclaimer</h4>
        <p>This tool is for informational purposes only. Always verify data with official sources before making investment decisions.</p>
        
        <h4>Support</h4>
        <p>For issues or feature requests, please refer to the user guide or check the symbol mapping help.</p>
        
        <hr>
        <p style="text-align: center; font-size: 12px; color: #7f8c8d;">Made with ❤️ for Indian Investors</p>
    `;

	modal.style.display = "block";
}

// Close help modal
function closeHelpModal() {
	const modal = document.getElementById("helpModal");
	modal.style.display = "none";
}

// Update footer status
function updateFooterStatus(message, isError = false) {
	const statusSpan = document.getElementById("footerStatus");
	if (statusSpan) {
		statusSpan.innerHTML = isError ? `⚠️ ${message}` : `✅ ${message}`;
		statusSpan.style.color = isError ? "#e74c3c" : "#2ecc71";
		setTimeout(() => {
			if (
				statusSpan.innerHTML === (isError ? `⚠️ ${message}` : `✅ ${message}`)
			) {
				statusSpan.innerHTML = "✅ System ready";
				statusSpan.style.color = "#95a5a6";
			}
		}, 5000);
	}
}

// Update last update time in footer
function updateLastUpdateTime() {
	const timeSpan = document.getElementById("lastUpdateTime");
	if (timeSpan) {
		const now = new Date();
		const timeStr = now.toLocaleTimeString("en-IN", {
			hour: "2-digit",
			minute: "2-digit",
		});
		timeSpan.innerHTML = `🕐 Last update: ${timeStr}`;
	}
}

// Override existing functions to update footer
const originalUpdatePrice = updatePrice;
updatePrice = function (symbol, newPrice) {
	const result = originalUpdatePrice(symbol, newPrice);
	if (result) {
		updateFooterStatus(`Price updated for ${symbol}`);
		updateLastUpdateTime();
	}
	return result;
};

const originalBatchUpdate = batchUpdateAllPrices;
batchUpdateAllPrices = async function () {
	updateFooterStatus("Fetching prices...");
	await originalBatchUpdate();
	updateLastUpdateTime();
};

// Add keyboard shortcuts
document.addEventListener("keydown", (e) => {
	// Ctrl + N: Focus Add Transaction form
	if (e.ctrlKey && e.key === "n") {
		e.preventDefault();
		document.getElementById("symbol").focus();
		updateFooterStatus("Ready to add transaction");
	}
	// Ctrl + U: Update all prices
	else if (e.ctrlKey && e.key === "u") {
		e.preventDefault();
		batchUpdateAllPrices();
	}
	// Ctrl + E: Export data
	else if (e.ctrlKey && e.key === "e") {
		e.preventDefault();
		exportData();
	}
	// Ctrl + F: Focus price update symbol
	else if (e.ctrlKey && e.key === "f") {
		e.preventDefault();
		document.getElementById("priceSymbol").focus();
		updateFooterStatus("Enter symbol to update price");
	}
	// F1: Show help
	else if (e.key === "F1") {
		e.preventDefault();
		showHelp();
	}
});

// Close modal when clicking outside
window.onclick = function (event) {
	const modal = document.getElementById("helpModal");
	if (event.target === modal) {
		modal.style.display = "none";
	}
};

// Initialize footer
function initFooter() {
	updateLastUpdateTime();
	setInterval(updateLastUpdateTime, 60000); // Update every minute
}

// Call initFooter when page loads
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initFooter);
} else {
	initFooter();
}

// ============================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE FOR HTML ONCLICK
// ============================================

// Make all helper functions available globally
window.scrollToSection = scrollToSection;
window.showHelp = showHelp;
//window.showKeyboardShortcuts = showKeyboardShortcuts;
window.showSymbolGuide = showSymbolGuide;
window.showAbout = showAbout;
window.closeHelpModal = closeHelpModal;
window.exportData = exportData;

// Also expose any other functions that might be needed by HTML
window.addTransaction = addTransaction;
window.updatePrice = updatePrice;
window.batchUpdateAllPrices = batchUpdateAllPrices;
window.deleteTransaction = deleteTransaction;
window.editTransaction = editTransaction;
window.clearAllData = clearAllData;
window.addSymbolMapping = addSymbolMapping;
window.removeSymbolMapping = removeSymbolMapping;

// ============================================
// DONATION / QR CODE FUNCTIONALITY
// ============================================

// UPI QR Code (Replace with your actual UPI ID)
const UPI_ID = "9938430522@ptyes"; // CHANGE THIS to your actual UPI ID
const UPI_NAME = "Subodh Singh";
const UPI_NOTE = "Portfolio Manager Support";

// Generate UPI payment URL
function getUPIUrl(amount = "") {
	let url = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;
	if (amount && amount > 0) {
		url += `&am=${amount}`;
	}
	url += `&tn=${encodeURIComponent(UPI_NOTE)}`;
	return url;
}

// Generate QR code using a free API
async function generateQRCode(data, containerId) {
	const container = document.getElementById(containerId);
	if (!container) return;

	// Using QRServer API (free, no API key needed)
	const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;

	container.innerHTML = `
        <img src="${qrUrl}" alt="QR Code" class="qr-image" onerror="this.onerror=null; this.src='https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(data)}'">
        <div class="donation-address" onclick="copyToClipboard('${data.replace(/'/g, "\\'")}')">
            📋 Click to copy payment link
        </div>
        <div id="copySuccess" class="donation-success" style="display:none">✅ Copied to clipboard!</div>
    `;
}

// Show UPI QR Code
function showUPIQR() {
	const upiUrl = getUPIUrl();
	generateQRCode(upiUrl, "qrContainer");
	updateFooterStatus("UPI QR code generated", false);
}

// Show PayPal QR (or link)
function showPayPalQR() {
	// Replace with your PayPal.me link
	const paypalLink = "https://paypal.me/SubodhChandraSingh"; // CHANGE THIS
	const container = document.getElementById("qrContainer");

	container.innerHTML = `
        <div style="text-align: center;">
            <img src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_37x23.jpg" alt="PayPal" style="margin-bottom: 10px;">
            <div class="qr-placeholder" style="color: #333;">
                <p>💝 Click below to donate via PayPal</p>
                <a href="${paypalLink}" target="_blank" class="donation-btn" style="background: #0070ba; color: white; display: inline-block; margin-top: 10px;">
                    Donate with PayPal
                </a>
                <div class="donation-address" onclick="copyToClipboard('${paypalLink}')" style="margin-top: 15px;">
                    📋 Copy PayPal link
                </div>
            </div>
        </div>
    `;
	updateFooterStatus("PayPal donation option shown", false);
}

// Show Card payment (Razorpay/Stripe)
function showCardQR() {
	// Option 1: UPI QR for card payments (via payment gateway)
	// Option 2: Link to Razorpay payment page
	const paymentLink = "https://rzp.io/l/yourpaymentlink"; // CHANGE THIS

	const container = document.getElementById("qrContainer");

	container.innerHTML = `
        <div style="text-align: center;">
            <div class="qr-placeholder" style="color: #333;">
                <p>💳 Secure card payments</p>
                <a href="${paymentLink}" target="_blank" class="donation-btn" style="background: #2ecc71; color: white; display: inline-block; margin: 10px 0;">
                    Pay with Card
                </a>
                <div class="donation-address" onclick="copyToClipboard('${paymentLink}')">
                    📋 Copy payment link
                </div>
                <p style="font-size: 11px; margin-top: 15px;">🔒 Secure payment via Razorpay</p>
            </div>
        </div>
    `;
	updateFooterStatus("Card payment option shown", false);
}

// Copy to clipboard helper
function copyToClipboard(text) {
	navigator.clipboard
		.writeText(text)
		.then(() => {
			const successDiv = document.getElementById("copySuccess");
			if (successDiv) {
				successDiv.style.display = "block";
				setTimeout(() => {
					successDiv.style.display = "none";
				}, 2000);
			} else {
				alert("Link copied to clipboard!");
			}
			updateFooterStatus("Payment link copied!", false);
		})
		.catch(() => {
			alert("Could not copy. Please manually copy the link.");
		});
}

// Initialize donation buttons
function initDonationButtons() {
	const upiBtn = document.getElementById("showUPIBtn");
	const paypalBtn = document.getElementById("showPayPalBtn");
	const cardBtn = document.getElementById("showCardBtn");

	if (upiBtn) upiBtn.addEventListener("click", showUPIQR);
	if (paypalBtn) paypalBtn.addEventListener("click", showPayPalQR);
	if (cardBtn) cardBtn.addEventListener("click", showCardQR);
}

// Call this in DOMContentLoaded
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initDonationButtons);
} else {
	initDonationButtons();
}
