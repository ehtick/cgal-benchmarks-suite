document.addEventListener("DOMContentLoaded", () => {
    const dateSelect = document.getElementById("date-select");
    const compareSelect = document.getElementById("compare-select");
    let jsonData = {};
    let compareData = {};
    let allDatasets = [];
    let allFiles = [];
    let availableComponents = [];

    async function fetchBenchmarkFiles() {
        try {
            const response = await fetch("benchmark/json_results/");
            const text = await response.text();
            return parseFileLinks(text);
        } catch (error) {
            console.error("Error fetching JSON files:", error);
            return {};
        }
    }

    function parseFileLinks(htmlText) {
        const doc = new DOMParser().parseFromString(htmlText, "text/html");
        const files = Array.from(doc.querySelectorAll("a"))
            .map(link => link.getAttribute("href"))
            .filter(href => href.includes("_results_") && href.endsWith(".json"));
        const filesByDate = {};
        files.forEach(file => {
            const datePart = file.match(/(\d{4}-\d{2}-\d{2})/);
            if (datePart) {
                const date = datePart[1];
                if (!filesByDate[date]) {
                    filesByDate[date] = [];
                }
                filesByDate[date].push(file);
            }
        });
        
        return filesByDate;
    }

    async function loadJSONsByDate(selectedDate, isCompare = false) {
        const target = isCompare ? compareData : jsonData;
        try {
            if (target) {
                Object.keys(target).forEach(key => delete target[key]);
            }
            const files = await fetchBenchmarkFiles();
            if (!files || !files[selectedDate]) {
                console.error(`No files found for date: ${selectedDate}`);
                return;
            }
            const filesForDate = files[selectedDate] || [];
            if (filesForDate.length === 0) {
                console.warn(`Empty file list for date: ${selectedDate}`);
                return;
            }
            const promises = filesForDate.map(async (file) => {
                try {
                    const response = await fetch(`benchmark/json_results/${file}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    const data = await response.json();
                    if (!data) {
                        console.error(`Empty or invalid JSON in file: ${file}`);
                        return;
                    }
                    const filenameMatch = file.match(/([^\/]+)_results_/);
                    if (filenameMatch && filenameMatch[1]) {
                        const componentName = filenameMatch[1];
                        if (data[componentName]) {
                            target[componentName] = data[componentName];
                        } else {
                            target[componentName] = data;
                        }
                        if (!isCompare && !availableComponents.includes(componentName)) {
                            availableComponents.push(componentName);
                        }
                    } else {
                        console.error(`Could not extract component name from file: ${file}`);
                    }
                } catch (error) {
                    console.error(`Error loading JSON file: ${file}`, error);
                }
            });
            await Promise.all(promises);
            if (Object.keys(target).length > 0) {
                updateSummaryTable(jsonData, Object.keys(compareData).length > 0 ? compareData : null);
                const finishedAt = Object.values(jsonData).find(c => c.finished_at)?.finished_at;
                if (finishedAt) {
                    document.getElementById("benchmark-finished-time").textContent = `Finished At: ${finishedAt}`;
                } else {
                    document.getElementById("benchmark-finished-time").textContent = `Finished At: (not recorded)`;
                }
            } else {
                console.warn(`No valid data loaded for date: ${selectedDate}`);
            }
        } catch (error) {
            console.error("Error loading JSON files for date:", selectedDate, error);
        }
    }

    function calculateTotalStats(jsonData) {
        const uniqueDatasets = new Set();
        const uniqueFiles = new Set();
        Object.keys(jsonData).forEach(component => {
            Object.keys(jsonData[component]).forEach(dataset => {
                uniqueDatasets.add(dataset);
                Object.keys(jsonData[component][dataset]).forEach(file => {
                    uniqueFiles.add(jsonData[component][dataset][file].path + file);
                });
            });
        });
        return {
            datasets: uniqueDatasets.size,
            files: uniqueFiles.size
        };
    }

    function updateSummaryTable(jsonData, compareData = null) {
        const totalStats = calculateTotalStats(jsonData);
        const summaryInfo = document.getElementById("summary-info");
        let compareStatsHtml = '';
        if (compareData) {
            const compareStats = calculateTotalStats(compareData);
            compareStatsHtml = `
                <div class="comparison-info">
                    <p>Comparison Dataset: ${compareSelect.options[compareSelect.selectedIndex].text}</p>
                    <p>Files: ${compareStats.files} (Diff: ${compareStats.files - totalStats.files})</p>
                </div>
            `;
        }
        summaryInfo.innerHTML = `
            <div class="summary-info">
                <p>Current Dataset: ${dateSelect.options[dateSelect.selectedIndex].text}</p>
                <p>Total Datasets: ${totalStats.datasets}</p>
                <p>Total Files: ${totalStats.files}</p>
                ${compareStatsHtml}
            </div>
        `;
        const table = document.querySelector("#summary-table");
        table.parentNode.insertBefore(summaryInfo, table);
        const summaryTableBody = document.querySelector("#summary-table tbody");
        summaryTableBody.innerHTML = "";
        Object.keys(jsonData).forEach(component => {
            const validFiles = [];
            const errorFiles = [];
            const timeoutFiles = [];
            Object.keys(jsonData[component] || {}).forEach(dataset => {
                Object.entries(jsonData[component][dataset]).forEach(([filename, data]) => {
                    if (data.Robustness) {
                        if (data.Robustness.VALID_SOLID_OUTPUT === 1) {
                            validFiles.push({filename, dataset});
                        }
                        if (data.Robustness.INPUT_IS_INVALID === 1 ||
                            data.Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1) {
                            errorFiles.push({filename, dataset});
                        }
                        if (data.Robustness.TIMEOUT === 1) {
                            timeoutFiles.push({filename, dataset});
                        }
                    }
                });
            });
            let validAdded = 0;
            let validRemoved = 0;
            let errorAdded = 0;
            let errorRemoved = 0;
            let timeoutAdded = 0;
            let timeoutRemoved = 0;
            if (compareData && compareData[component]) {
                Object.keys(compareData[component]).forEach(dataset => {
                    Object.entries(compareData[component][dataset] || {}).forEach(([filename, data]) => {
                        const fileExists = jsonData[component][dataset] && jsonData[component][dataset][filename];
                        if (data.Robustness) {
                            if (data.Robustness.VALID_SOLID_OUTPUT === 1) {
                                if (!fileExists) {
                                    validRemoved++;
                                } else if (jsonData[component][dataset][filename].Robustness && jsonData[component][dataset][filename].Robustness.VALID_SOLID_OUTPUT !== 1) {
                                    validRemoved++;
                                }
                            }
                            if (data.Robustness.INPUT_IS_INVALID === 1 ||
                                data.Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1) {
                                if (!fileExists) {
                                    errorRemoved++;
                                } else if (jsonData[component][dataset][filename].Robustness &&
                                         !(jsonData[component][dataset][filename].Robustness.INPUT_IS_INVALID === 1 ||
                                           jsonData[component][dataset][filename].Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1)) {
                                    errorRemoved++;
                                }
                            }
                            if (data.Robustness.TIMEOUT === 1) {
                                if (!fileExists) {
                                    timeoutRemoved++;
                                } else if (jsonData[component][dataset][filename].Robustness && jsonData[component][dataset][filename].Robustness.TIMEOUT !== 1) {
                                    timeoutRemoved++;
                                }
                            }
                        }
                    });
                });
                Object.keys(jsonData[component]).forEach(dataset => {
                    Object.entries(jsonData[component][dataset] || {}).forEach(([filename, data]) => {
                        const fileExists = compareData[component][dataset] && compareData[component][dataset][filename];
                        if (data.Robustness) {
                            if (data.Robustness.VALID_SOLID_OUTPUT === 1) {
                                if (!fileExists) {
                                    validAdded++;
                                } else if (compareData[component][dataset][filename].Robustness && compareData[component][dataset][filename].Robustness.VALID_SOLID_OUTPUT !== 1) {
                                    validAdded++;
                                }
                            }
                            if (data.Robustness.INPUT_IS_INVALID === 1 ||
                                data.Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1) {
                                if (!fileExists) {
                                    errorAdded++;
                                } else if (compareData[component][dataset][filename].Robustness &&
                                         !(compareData[component][dataset][filename].Robustness.INPUT_IS_INVALID === 1 ||
                                           compareData[component][dataset][filename].Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1)) {
                                    errorAdded++;
                                }
                            }
                            if (data.Robustness.TIMEOUT === 1) {
                                if (!fileExists) {
                                    timeoutAdded++;
                                } else if (compareData[component][dataset][filename].Robustness && compareData[component][dataset][filename].Robustness.TIMEOUT !== 1) {
                                    timeoutAdded++;
                                }
                            }
                        }
                    });
                });
            }
            const validDiff = validAdded - validRemoved;
            const errorDiff = errorAdded - errorRemoved;
            const timeoutDiff = timeoutAdded - timeoutRemoved;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td class="component-cell">${component}</td>
                <td data-type="valid" data-added="${validAdded}" data-removed="${validRemoved}" data-diff="${validDiff}">
                    ${validFiles.length}
                    ${compareData ?
                        `<span class="diff ${validDiff > 0 ? 'better' : validDiff < 0 ? 'worse' : 'same'}">
                            ${validAdded > 0 ? `(+${validAdded})` : ''} ${validRemoved > 0 ? `(-${validRemoved})` : ''}
                        </span>`
                        : ''}
                </td>
                <td data-type="error" data-added="${errorAdded}" data-removed="${errorRemoved}" data-diff="${errorDiff}">
                    ${errorFiles.length}
                    ${compareData ?
                        `<span class="diff ${errorDiff < 0 ? 'better' : errorDiff > 0 ? 'worse' : 'same'}">
                            ${errorAdded > 0 ? `(+${errorAdded})` : ''} ${errorRemoved > 0 ? `(-${errorRemoved})` : ''}
                        </span>`
                        : ''}
                </td>
                <td data-type="timeout" data-added="${timeoutAdded}" data-removed="${timeoutRemoved}" data-diff="${timeoutDiff}">
                    ${timeoutFiles.length}
                    ${compareData ?
                        `<span class="diff ${timeoutDiff < 0 ? 'better' : timeoutDiff > 0 ? 'worse' : 'same'}">
                            ${timeoutAdded > 0 ? `(+${timeoutAdded})` : ''} ${timeoutRemoved > 0 ? `(-${timeoutRemoved})` : ''}
                        </span>`
                        : ''}
                </td>
            `;
            summaryTableBody.appendChild(row);
        });
        addTableClickHandlers();
        setupModalClose();
    }

    function addTableClickHandlers() {
        document.querySelectorAll(".component-cell").forEach(cell => {
            cell.addEventListener("click", handleComponentClick);
        });
        document.querySelectorAll("#summary-table td:not(.component-cell)").forEach(cell => {
            cell.addEventListener("click", handleTableCellClick);
        });
    }

    function handleComponentClick(event) {
        const component = event.target.textContent;
        showModal(component, "all");
    }

    function handleTableCellClick(event) {
        const cell = event.target;
        const component = cell.parentElement.firstElementChild.textContent;
        const type = getTypeFromCellIndex(cell.cellIndex);
        const diffValue = parseInt(cell.getAttribute('data-diff')) || 0;
        console.log(`Clicked on cell: component=${component}, type=${type}, diffValue=${diffValue}`);
        window.lastDifferences = identifyDifferences(component, type);
        showModal(component, type, diffValue);
    }

    function getTypeFromCellIndex(index) {
        const types = {
            1: "valid",
            2: "error",
            3: "timeout"
        };
        return types[index];
    }

    function showModal(component, type, diffValue = 0) {
        const modal = document.getElementById("dataset-modal");
        const modalTitle = document.getElementById("modal-title");
        const datasetList = document.getElementById("dataset-list");
        const searchResults = document.getElementById("search-results");
        const resultsList = document.getElementById("results-list");
        const resultCount = document.getElementById("result-count");
        const filesContainer = document.getElementById("files-container");
        const filesList = document.getElementById("files-list");
        const globalSearch = document.getElementById("global-search");
        const clearSearch = document.getElementById("clear-search");
        console.log(`Showing modal for: component=${component}, type=${type}, diffValue=${diffValue}`);
        modalTitle.textContent = `${component} - ${type.charAt(0).toUpperCase() + type.slice(1)} Files`;
        datasetList.innerHTML = '';
        filesList.innerHTML = '';
        resultsList.innerHTML = '';
        searchResults.classList.add("hidden");
        globalSearch.value = '';
        clearSearch.classList.remove("visible");
        allDatasets = [];
        allFiles = [];
        const datasetDiffs = {};
        if (compareData && compareData[component]) {
            Object.keys(jsonData[component] || {}).forEach(dataset => {
                datasetDiffs[dataset] = {
                    valid: 0,
                    error: 0,
                    timeout: 0,
                    total: 0
                };
                Object.entries(jsonData[component][dataset] || {}).forEach(([filename, data]) => {
                    if (data.Robustness) {
                        if (data.Robustness.VALID_SOLID_OUTPUT === 1) {
                            datasetDiffs[dataset].valid++;
                            datasetDiffs[dataset].total++;
                        }
                        if (data.Robustness.INPUT_IS_INVALID === 1 ||
                            data.Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1) {
                            datasetDiffs[dataset].error++;
                            datasetDiffs[dataset].total++;
                        }
                        if (data.Robustness.TIMEOUT === 1) {
                            datasetDiffs[dataset].timeout++;
                            datasetDiffs[dataset].total++;
                        }
                    }
                });
                if (compareData[component][dataset]) {
                    Object.entries(compareData[component][dataset] || {}).forEach(([filename, data]) => {
                        if (data.Robustness) {
                            if (data.Robustness.VALID_SOLID_OUTPUT === 1) {
                                datasetDiffs[dataset].valid--;
                                datasetDiffs[dataset].total--;
                            }
                            if (data.Robustness.INPUT_IS_INVALID === 1 ||
                                data.Robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1) {
                                datasetDiffs[dataset].error--;
                                datasetDiffs[dataset].total--;
                            }
                            if (data.Robustness.TIMEOUT === 1) {
                                datasetDiffs[dataset].timeout--;
                                datasetDiffs[dataset].total--;
                            }
                        }
                    });
                }
            });
        }
        const datasetsArray = Object.keys(jsonData[component] || {}).map(dataset => {
            const filteredFiles = getFilteredFiles(jsonData[component][dataset], type);
            const fileCount = Object.keys(filteredFiles).length;
            let typeDiff = 0;
            if (compareData && datasetDiffs[dataset]) {
                typeDiff = datasetDiffs[dataset][type] || 0;
            }
            return {
                name: dataset,
                fileCount: fileCount,
                diff: typeDiff
            };
        }).filter(dataset => dataset.fileCount > 0);
        datasetsArray.sort((a, b) => {
            if (compareData) {
                const diffA = Math.abs(a.diff);
                const diffB = Math.abs(b.diff);
                if (diffA !== diffB) return diffB - diffA;
            }
            return a.name.localeCompare(b.name);
        });
        datasetsArray.forEach(dataset => {
            const datasetButton = document.createElement("li");
            let diffText = '';
            if (compareData && dataset.diff !== 0) {
                diffText = ` <span class="diff-label ${dataset.diff > 0 ? 'better' : 'worse'}">(${dataset.diff > 0 ? '+' : ''}${dataset.diff})</span>`;
            }
            datasetButton.innerHTML = `${dataset.name} (${dataset.fileCount})${diffText}`;
            datasetButton.dataset.name = dataset.name;
            datasetButton.classList.add("dataset-button");
            if (compareData && dataset.diff !== 0) {
                datasetButton.classList.add(dataset.diff > 0 ? "dataset-added" : "dataset-removed");
            }
            datasetButton.addEventListener("click", () => {
                document.querySelectorAll(".dataset-button").forEach(btn => {
                    btn.classList.remove("selected");
                });
                datasetButton.classList.add("selected");
                searchResults.classList.add("hidden");
                filesContainer.style.display = "block";
                showFilesForDataset(jsonData[component][dataset.name], type, filesList, dataset.name, compareData ? true : false);
            });
            datasetList.appendChild(datasetButton);
            allDatasets.push({
                element: datasetButton,
                name: dataset.name.toLowerCase(),
                fileCount: dataset.fileCount,
                diff: dataset.diff
            });
            if (jsonData[component][dataset.name]) {
                Object.entries(jsonData[component][dataset.name]).forEach(([fileName, fileData]) => {
                    if (type === "all" || (fileData.Robustness && matchesType(fileData.Robustness, type))) {
                        const displayName = fileData.path ? `${fileData.path}${fileName}` : fileName;
                        let isDifferent = false;
                        let diffType = null;
                        if (compareData && compareData[component] && compareData[component][dataset.name]) {
                            const compareFileData = compareData[component][dataset.name][fileName];
                            const existsInCompare = compareFileData !== undefined;
                            if (type !== "all") {
                                if (existsInCompare) {
                                    const currentMatchesType = matchesType(fileData.Robustness, type);
                                    const compareMatchesType = compareFileData.Robustness && matchesType(compareFileData.Robustness, type);
                                    if (currentMatchesType && !compareMatchesType) {
                                        isDifferent = true;
                                        diffType = "added";
                                    }
                                } else {
                                    isDifferent = true;
                                    diffType = "added";
                                }
                            } else {
                                if (!existsInCompare) {
                                    isDifferent = true;
                                    diffType = "added";
                                }
                            }
                        }
                        allFiles.push({
                            fileName: fileName,
                            displayName: displayName,
                            datasetName: dataset.name,
                            data: fileData,
                            isDifferent: isDifferent,
                            diffType: diffType
                        });
                    }
                });
                if (compareData && compareData[component] && compareData[component][dataset.name]) {
                    Object.entries(compareData[component][dataset.name]).forEach(([fileName, compareFileData]) => {
                        const existsInCurrent = jsonData[component][dataset.name][fileName] !== undefined;
                        if (!existsInCurrent && compareFileData.Robustness) {
                            if (type === "all" || matchesType(compareFileData.Robustness, type)) {
                                const displayName = compareFileData.path ? `${compareFileData.path}${fileName}` : fileName;
                                allFiles.push({
                                    fileName: fileName,
                                    displayName: displayName,
                                    datasetName: dataset.name,
                                    data: compareFileData,
                                    isDifferent: true,
                                    diffType: "removed"
                                });
                            }
                        }
                    });
                }
            }
        });
        if (datasetsArray.length > 0) {
            const firstDataset = datasetList.querySelector(".dataset-button");
            if (firstDataset) {
                firstDataset.classList.add("selected");
                showFilesForDataset(jsonData[component][datasetsArray[0].name], type, filesList, datasetsArray[0].name, compareData ? true : false);
            }
        }
        globalSearch.addEventListener("input", function() {
            const searchTerm = this.value.toLowerCase().trim();
            console.log("Search term:", searchTerm);
            clearSearch.classList.toggle("visible", searchTerm.length > 0);
            if (searchTerm.length > 0) {
                const filteredFiles = allFiles.filter(file => {
                    const displayText = (file.displayName || file.fileName || "").toLowerCase();
                    const datasetText = (file.datasetName || "").toLowerCase();
                    return displayText.includes(searchTerm) || datasetText.includes(searchTerm);
                });
                console.log("Found files:", filteredFiles.length);
                resultsList.innerHTML = '';
                resultCount.textContent = filteredFiles.length;
                filteredFiles.forEach(file => {
                    const resultItem = document.createElement("li");
                    resultItem.classList.add("search-result-item");
                    const displayText = file.displayName || file.fileName || "";
                    const highlightedName = highlightText(displayText, searchTerm);
                    let diffIndicator = '';
                    if (file.isDifferent) {
                        diffIndicator = `<span class="diff-indicator ${file.diffType === 'added' ? 'added' : 'removed'}">${file.diffType === 'added' ? '+' : '-'}</span>`;
                    }
                    resultItem.innerHTML = `
                        ${diffIndicator}
                        <span>${highlightedName}</span>
                        <span class="dataset-name">${file.datasetName}</span>
                    `;
                    if (file.isDifferent) {
                        resultItem.classList.add(`file-${file.diffType}`);
                    }
                    resultItem.addEventListener("click", () => {
                        document.getElementById("dataset-modal").style.display = "none";
                        displayFileDetails(file.data, file.fileName, file.datasetName);
                    });
                    resultsList.appendChild(resultItem);
                });
                searchResults.classList.remove("hidden");
                filesContainer.style.display = "none";
            } else {
                searchResults.classList.add("hidden");
                filesContainer.style.display = "block";
            }
        });
        clearSearch.addEventListener("click", function() {
            globalSearch.value = "";
            this.classList.remove("visible");
            searchResults.classList.add("hidden");
            filesContainer.style.display = "block";
            const event = new Event("input", { bubbles: true });
            globalSearch.dispatchEvent(event);
        });
        modal.style.display = "block";
    }

    function highlightText(text, searchTerm) {
        if (!searchTerm) return text;
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="highlight-text">$1</span>');
    }

    function identifyDifferences(component, type) {
        if (!compareData || !jsonData) {
            return null;
        }
        const differences = {
            added: [],
            removed: [],
            changedType: []
        };
        if (!jsonData[component] || !compareData[component]) {
            return differences;
        }
        Object.keys(jsonData[component]).forEach(dataset => {
            if (!compareData[component][dataset]) {
                Object.entries(jsonData[component][dataset]).forEach(([fileName, fileData]) => {
                    if (type === "all" || (fileData.Robustness && matchesType(fileData.Robustness, type))) {
                        differences.added.push({
                            component,
                            dataset,
                            fileName,
                            fileData
                        });
                    }
                });
                return;
            }
            Object.entries(jsonData[component][dataset]).forEach(([fileName, fileData]) => {
                const compareFileData = compareData[component][dataset][fileName];
                if (!compareFileData) {
                    if (type === "all" || (fileData.Robustness && matchesType(fileData.Robustness, type))) {
                        differences.added.push({
                            component,
                            dataset,
                            fileName,
                            fileData
                        });
                    }
                    return;
                }
                if (type !== "all" && fileData.Robustness && compareFileData.Robustness) {
                    const currentIsType = matchesType(fileData.Robustness, type);
                    const compareIsType = matchesType(compareFileData.Robustness, type);
                    if (currentIsType && !compareIsType) {
                        differences.changedType.push({
                            component,
                            dataset,
                            fileName,
                            fileData,
                            changeType: "added_to_type"
                        });
                    } else if (!currentIsType && compareIsType) {
                        differences.changedType.push({
                            component,
                            dataset,
                            fileName,
                            fileData: compareFileData,
                            changeType: "removed_from_type"
                        });
                    }
                }
            });
            Object.entries(compareData[component][dataset]).forEach(([fileName, compareFileData]) => {
                if (!jsonData[component][dataset][fileName]) {
                    if (type === "all" || (compareFileData.Robustness && matchesType(compareFileData.Robustness, type))) {
                        differences.removed.push({
                            component,
                            dataset,
                            fileName,
                            fileData: compareFileData
                        });
                    }
                }
            });
        });
        Object.keys(compareData[component] || {}).forEach(dataset => {
            if (!jsonData[component][dataset]) {
                Object.entries(compareData[component][dataset]).forEach(([fileName, fileData]) => {
                    if (type === "all" || (fileData.Robustness && matchesType(fileData.Robustness, type))) {
                        differences.removed.push({
                            component,
                            dataset,
                            fileName,
                            fileData
                        });
                    }
                });
            }
        });
        return differences;
    }

    function getFilteredFiles(datasetData, type) {
        if (type === "all") {
            return Object.entries(datasetData).reduce((acc, [fileName, fileData]) => {
                acc[fileName] = fileData;
                return acc;
            }, {});
        }
        return Object.entries(datasetData).filter(([_, fileData]) => {
            if (!fileData.Robustness) return false;
            return matchesType(fileData.Robustness, type);
        }).reduce((acc, [fileName, fileData]) => {
            acc[fileName] = fileData;
            return acc;
        }, {});
    }

    function showFilesForDataset(datasetData, type, filesList, datasetName, isComparing = false) {
        filesList.innerHTML = '';
        let files;
        if (type === "all") {
            files = Object.entries(datasetData);
        } else {
            files = Object.entries(datasetData).filter(([_, fileData]) => {
                if (!fileData.Robustness) return false;
                return matchesType(fileData.Robustness, type);
            });
        }

        const fileDiffs = [];
        const differences = window.lastDifferences;

        files.forEach(([fileName, fileData]) => {
            let isDifferent = false;
            let diffType = null;

            if (differences) {
                const isAdded = differences.added.some(item =>
                    item.component === Object.keys(jsonData)[0] &&
                    item.dataset === datasetName &&
                    item.fileName === fileName);

                if (isAdded) {
                    isDifferent = true;
                    diffType = "added";
                }

                const hasChangedType = differences.changedType.some(item =>
                    item.component === Object.keys(jsonData)[0] &&
                    item.dataset === datasetName &&
                    item.fileName === fileName &&
                    item.changeType === "added_to_type");

                if (hasChangedType) {
                    isDifferent = true;
                    diffType = "added";
                }
            }

            fileDiffs.push({
                fileName,
                fileData,
                isDifferent,
                diffType
            });
        });

        if (differences) {
            differences.removed.forEach(item => {
                if (item.dataset === datasetName) {
                    fileDiffs.push({
                        fileName: item.fileName,
                        fileData: item.fileData,
                        isDifferent: true,
                        diffType: "removed"
                    });
                }
            });

            differences.changedType.forEach(item => {
                if (item.dataset === datasetName && item.changeType === "removed_from_type") {
                    fileDiffs.push({
                        fileName: item.fileName,
                        fileData: item.fileData,
                        isDifferent: true,
                        diffType: "removed"
                    });
                }
            });
        }

        fileDiffs.sort((a, b) => {
            if (a.isDifferent !== b.isDifferent) {
                return a.isDifferent ? -1 : 1;
            }
            if (a.isDifferent && b.isDifferent && a.diffType !== b.diffType) {
                return a.diffType === "added" ? -1 : 1;
            }
            return a.fileName.localeCompare(b.fileName);
        });

        if (isComparing && differences) {
            const parentNode = filesList.parentNode;
            const existingSummary = parentNode.querySelector(".file-diff-summary");
            if (existingSummary) {
                existingSummary.remove();
            }

            const addedCount = fileDiffs.filter(file => file.isDifferent && file.diffType === "added").length;
            const removedCount = fileDiffs.filter(file => file.isDifferent && file.diffType === "removed").length;

            if (addedCount > 0 || removedCount > 0) {
                const diffSummary = document.createElement("div");
                diffSummary.className = "file-diff-summary";

                let summaryText = "";
                if (addedCount > 0) {
                    summaryText += `<span class="file-count added">+${addedCount} new</span>`;
                }
                if (removedCount > 0) {
                    if (addedCount > 0) summaryText += " ";
                    summaryText += `<span class="file-count removed">-${removedCount} removed</span>`;
                }

                diffSummary.innerHTML = summaryText;
                parentNode.insertBefore(diffSummary, filesList);
            }
        }

        fileDiffs.forEach(({ fileName, fileData, isDifferent, diffType }) => {
            const fileElement = document.createElement("li");
            const displayName = fileData.path ? `${fileData.path}${fileName}` : fileName;

            fileElement.className = "file-item";

            if (isDifferent) {
                const indicator = document.createElement("span");
                indicator.className = `diff-indicator ${diffType === 'added' ? 'added' : 'removed'}`;
                indicator.textContent = diffType === 'added' ? '+' : '-';
                fileElement.appendChild(indicator);

                const nameSpan = document.createElement("span");
                nameSpan.className = "file-name-text";
                nameSpan.textContent = displayName;
                nameSpan.style.paddingLeft = "10px";
                fileElement.appendChild(nameSpan);

                if (diffType === "added") {
                    fileElement.classList.add("file-added");
                } else {
                    fileElement.classList.add("file-removed");
                }
            } else {
                fileElement.textContent = displayName;
            }

            fileElement.addEventListener("click", () => {
                document.querySelectorAll(".file-item").forEach(item => {
                    item.classList.remove("selected");
                });
                fileElement.classList.add("selected");
                document.getElementById("dataset-modal").style.display = "none";
                displayFileDetails(fileData, fileName, datasetName);
            });

            filesList.appendChild(fileElement);

            allFiles.push({
                element: fileElement,
                name: displayName.toLowerCase(),
                displayName: displayName,
                fileName: fileName,
                datasetName: datasetName,
                data: fileData,
                isDifferent: isDifferent,
                diffType: diffType
            });
        });

        if (fileDiffs.length === 0) {
            const noFilesMsg = document.createElement("p");
            noFilesMsg.textContent = "No files of this type found in this dataset.";
            noFilesMsg.style.padding = "1rem";
            noFilesMsg.style.color = "#666";
            filesList.appendChild(noFilesMsg);
        }
    }

    function matchesType(robustness, type) {
        if (type === "all") return true;
        const conditions = {
            valid: () => robustness.VALID_SOLID_OUTPUT === 1,
            error: () => robustness.INPUT_IS_INVALID === 1 ||
                         robustness.OUTPUT_DISTANCE_IS_TOO_LARGE === 1,
            timeout: () => robustness.TIMEOUT === 1
        };
        return conditions[type]();
    }

    function setupModalClose() {
        const modal = document.getElementById("dataset-modal");
        document.querySelector(".close").addEventListener("click", () => {
            modal.style.display = "none";
        });
        window.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.style.display = "none";
            }
        });
    }

    function displayFileDetails(fileData, filename, datasetName) {
        const fileDetailsSection = document.getElementById("file-details");
        const fileNameDiv = document.getElementById("file-name");
        const performanceData = document.getElementById("performance-data");
        const qualityData = document.getElementById("quality-data");
        const robustnessData = document.getElementById("robustness-data");
        performanceData.innerHTML = "";
        qualityData.innerHTML = "";
        robustnessData.innerHTML = "";
        let displayPath = "";
        if (fileData.path) {
            displayPath = fileData.path;
        }
        fileNameDiv.innerHTML = `
            <p><strong>Dataset:</strong> ${datasetName}</p>
            <p><strong>File:</strong> ${displayPath}${filename}</p>
        `;
        let compareFileData = null;
        if (compareData && compareData[Object.keys(jsonData)[0]] &&
            compareData[Object.keys(jsonData)[0]][datasetName] &&
            compareData[Object.keys(jsonData)[0]][datasetName][filename]) {
            compareFileData = compareData[Object.keys(jsonData)[0]][datasetName][filename];
        }

        if (fileData.Performance) {
            Object.entries(fileData.Performance).forEach(([key, value]) => {
                let compareValue = null;
                if (compareFileData && compareFileData.Performance && compareFileData.Performance[key] !== undefined) {
                    compareValue = compareFileData.Performance[key];
                }
                performanceData.appendChild(createDataItem(key, value, compareValue, true));
            });
        }
        if (fileData.Quality) {
            Object.entries(fileData.Quality).forEach(([key, value]) => {
                qualityData.appendChild(createDataItem(key, value, null, false));
            });
        }
        if (fileData.Robustness) {
            Object.entries(fileData.Robustness).forEach(([key, value]) => {
                robustnessData.appendChild(createDataItem(key, value, null, false));
            });
        }
        fileDetailsSection.style.display = "block";
    }

    function createDataItem(label, value, compareValue = null, showComparison = true) {
        const item = document.createElement("div");
        item.classList.add("data-item");
        const labelElement = document.createElement("div");
        labelElement.classList.add("data-label");
        labelElement.textContent = formatLabel(label);
        const valueElement = document.createElement("div");
        valueElement.classList.add("data-value");
        valueElement.textContent = value;

        if (compareValue !== null && showComparison) {
            const diff = calculateDifference(value, compareValue);
            if (diff !== null) {
                const comparisonElement = document.createElement("span");
                comparisonElement.classList.add("comparison");
                let isImprovement = false;
                if (label.includes("seconds") || label.includes("memory_peaks")) {
                    isImprovement = parseFloat(value) < parseFloat(compareValue);
                }
                else if (label.includes("Mean_Min_Angle") || label.includes("Mean_Radius_Ratio")) {
                    isImprovement = parseFloat(value) > parseFloat(compareValue);
                }
                else if (label.includes("Complexity") || label.includes("degenerate_triangle") || label.includes("Hausdorff_distance")) {
                    isImprovement = parseFloat(value) < parseFloat(compareValue);
                }
                comparisonElement.classList.add(isImprovement ? "better" : "worse");
                comparisonElement.innerHTML = ` (${diff > 0 ? '+' : ''}${diff}% | ${compareValue})`;
                valueElement.appendChild(comparisonElement);
            }
        }
        item.appendChild(labelElement);
        item.appendChild(valueElement);
        return item;
    }

    function calculateDifference(currentVal, compareVal) {
        const current = parseFloat(currentVal);
        const compare = parseFloat(compareVal);
        if (!isNaN(current) && !isNaN(compare) && compare !== 0) {
            const percentChange = ((current - compare) / Math.abs(compare)) * 100;
            return percentChange.toFixed(2);
        }
        return null;
    }

    function formatLabel(label) {
        return label
            .split("_")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    }

    dateSelect.addEventListener("change", () => {
        loadJSONsByDate(dateSelect.value);
        if (compareSelect.value && compareSelect.value !== dateSelect.value) {
            loadJSONsByDate(compareSelect.value, true);
        } else {
            Object.keys(compareData).forEach(key => delete compareData[key]);
            updateSummaryTable(jsonData);
        }
    });

    compareSelect.addEventListener("change", () => {
        if (compareSelect.value && compareSelect.value !== dateSelect.value) {
            loadJSONsByDate(compareSelect.value, true);
        } else {
            Object.keys(compareData).forEach(key => delete compareData[key]);
            updateSummaryTable(jsonData);
        }
    });

    fetchBenchmarkFiles().then(filesByDate => {
        if (!filesByDate) {
            console.error("Failed to fetch benchmark files");
            return;
        }
        const sortedDates = Object.keys(filesByDate).sort().reverse();
        if (sortedDates.length) {
            const dateOptions = sortedDates.map(date => `<option value="${date}">${date}</option>`).join("");
            dateSelect.innerHTML = dateOptions;
            compareSelect.innerHTML = `<option value="">None</option>${dateOptions}`;
            if (sortedDates[0]) {
                loadJSONsByDate(sortedDates[0]);
            }
        } else {
            console.warn("No benchmark files found");
        }
    }).catch(error => {
        console.error("Error initializing benchmark viewer:", error);
    });
});