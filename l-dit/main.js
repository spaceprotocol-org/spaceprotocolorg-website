document.addEventListener("DOMContentLoaded", async function() {
    const loadingScreen = document.getElementById('loadingScreen');
    Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_ACCESS_TOKEN;

    const viewer = new Cesium.Viewer("cesiumContainer", {
        shouldAnimate: true,
        geocoder: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        homeButton: true
    });

    viewer.scene.globe.enableLighting = true;
    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.moon = new Cesium.Moon();

    let dataSource;
    let highlightedEntities = [];
    try {
        const resource = await Cesium.IonResource.fromAssetId(CONFIG.ASSET_ID);
        dataSource = await Cesium.CzmlDataSource.load(resource);
        await viewer.dataSources.add(dataSource);
        viewer.clock.multiplier = 50;
        const step = 10;

        const animationViewModel = viewer.animation.viewModel;
        animationViewModel.playForwardViewModel.command.beforeExecute.addEventListener(function(commandInfo) {
            viewer.clock.multiplier += step;
        });

        animationViewModel.playReverseViewModel.command.beforeExecute.addEventListener(function(commandInfo) {
            viewer.clock.multiplier -= step;
        });

        loadingScreen.style.display = 'none';
        const logo = document.getElementById('logo');
        logo.style.display = 'block';
        const searchContainer = document.getElementById('searchContainer');
        searchContainer.style.display = 'block';
        displayTopAndBottomSatellitesByDIT();

    } catch (error) {
        console.log(error);
    }

    const infoBox = document.getElementById("infoBox");

    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
        const pickedObject = viewer.scene.pick(movement.position);
        if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
            const entity = pickedObject.id;
            displayInfoBox(entity);
            showEntityPath(entity);
            highlightedEntities.push(entity);
        } else {
            infoBox.style.display = 'none';
            removeAllEntityPaths();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    function displayInfoBox(entity) {
    const description = entity.properties.description?.getValue(Cesium.JulianDate.now());
    const S_D = entity.properties.S_D?.getValue(Cesium.JulianDate.now());
    const S_I = entity.properties.S_I?.getValue(Cesium.JulianDate.now());
    const S_T = entity.properties.S_T?.getValue(Cesium.JulianDate.now());
    const DIT = entity.properties.DIT?.getValue(Cesium.JulianDate.now());

    infoBox.style.display = 'block';
    infoBox.innerHTML = `<div class="info-content">
    			     <strong>The higher the score the better</strong></span>
                             <strong>NORAD CAT ID:</strong> <span>${entity.id}</span>
                             <strong>NAME:</strong> <span>${entity.name}</span>
                             <strong>L-Detectability:</strong> <span>${S_D}</span>
                             <strong>L-Identifiability:</strong> <span>${S_I}</span>
                             <strong>L-Trackability:</strong> <span>${S_T}</span>
                             <strong>L-DIT:</strong> <span>${DIT}</span>
                         </div>`;
}
    function showEntityPath(entity) {
        if (!entity.path) {
            entity.path = new Cesium.PathGraphics({
                leadTime: 0,
                trailTime: 60 * 60 * 24,
                width: 1,
                material: Cesium.Color.WHITE
            });
        }
        viewer.entities.add(entity);
    }

    function removeEntityPath(entity) {
        if (entity.path) {
            entity.path = undefined;
            viewer.entities.remove(entity);
        }
    }

    function removeAllEntityPaths() {
        highlightedEntities.forEach(entity => {
            removeEntityPath(entity);
        });
        highlightedEntities = [];
    }

    function updateColors(property, numberOfBins = 5) {
        let minValue = Infinity;
        let maxValue = -Infinity;
        let hasValues = false;

        dataSource.entities.values.forEach(entity => {
            const value = entity.properties[property]?.getValue(Cesium.JulianDate.now());
            if (value !== undefined) {
                hasValues = true;
                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
            }
        });

        if (!hasValues) {
            removeLegend();
            return;
        }

        const binSize = (maxValue - minValue) / numberOfBins;
        const bins = [];
        for (let i = 0; i < numberOfBins; i++) {
            bins.push({
                min: minValue + i * binSize,
                max: minValue + (i + 1) * binSize,
                color: Cesium.Color.fromHsl(i / numberOfBins, 1.0, 0.5, 1.0)
            });
        }

        function getColor(value) {
            for (let bin of bins) {
                if (value >= bin.min && value <= bin.max) {
                    return bin.color;
                }
            }
            return Cesium.Color.WHITE;
        }

        dataSource.entities.values.forEach(entity => {
            const value = entity.properties[property]?.getValue(Cesium.JulianDate.now());
            if (value !== undefined && entity.point) {
                const color = getColor(value);
                entity.point.color = color;
            }
        });

        generateLegend(bins);
    }

    function generateLegend(bins) {
        removeLegend();
        const legendContainer = document.getElementById('legendContainer');

        bins.forEach(bin => {
            const legendItem = document.createElement('div');
            legendItem.style.display = 'flex';
            legendItem.style.alignItems = 'center';

            const colorBox = document.createElement('div');
            colorBox.style.width = '20px';
            colorBox.style.height = '20px';
            colorBox.style.backgroundColor = bin.color.toCssColorString();
            colorBox.style.border = '1px solid #000';
            colorBox.style.marginRight = '10px';

            const label = document.createElement('span');
            label.textContent = `${bin.min.toFixed(2)} - ${bin.max.toFixed(2)}`;

            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);

            legendContainer.appendChild(legendItem);
        });
    }

    function removeLegend() {
        const legendContainer = document.getElementById('legendContainer');
        while (legendContainer.firstChild) {
            legendContainer.removeChild(legendContainer.firstChild);
        }
    }

    updateColors('DIT', 5);
    document.querySelector('input[value="DIT"]').checked = true;

    document.querySelectorAll('input[name="property"]').forEach(radio => {
        radio.addEventListener('change', event => {
            updateColors(event.target.value);
        });
    });

    document.getElementById('reset').addEventListener('click', () => {
        document.querySelectorAll('input[name="property"]').forEach(radio => {
            radio.checked = false;
        });
        dataSource.entities.values.forEach(entity => {
            if (entity.point) {
                entity.point.color = Cesium.Color.YELLOW.withAlpha(1);
            }
        });
        removeLegend();
    });

    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');

    function performSearch() {
        const searchId = searchInput.value.trim();
        if (searchId) {
            const entity = dataSource.entities.getById(searchId);
            if (entity) {
                removeAllEntityPaths();
                showEntityPath(entity);
                highlightedEntities.push(entity);
                viewer.flyTo(entity).then(() => {
                    displayInfoBox(entity);
                });
            } else {
                alert('Entity not found.');
            }
        }
    }

    searchButton.addEventListener('click', performSearch);

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    const homeButton = viewer.homeButton.viewModel.command;
    homeButton.afterExecute.addEventListener(function() {
        removeAllEntityPaths();
        infoBox.style.display = 'none';
    });

    async function displayTopAndBottomSatellitesByDIT() {
        const entities = dataSource.entities.values;
        const satellitesWithDIT = entities
            .map(entity => ({
                id: entity.id,
                name: entity.name,
                DIT: entity.properties.DIT?.getValue(Cesium.JulianDate.now())
            }))
            .filter(satellite => satellite.DIT !== undefined);

        satellitesWithDIT.sort((a, b) => a.DIT - b.DIT);

        const top5Satellites = satellitesWithDIT.slice(-5).reverse();
        const bottom5Satellites = satellitesWithDIT.slice(0, 5);

        const infoboxContent = `<div><h3>Highest ranked by L-DIT</h3>${generateSatelliteList(top5Satellites)}</div>
                                <div><h3>Lowest ranked by L-DIT</h3>${generateSatelliteList(bottom5Satellites)}</div>`;

        const topBottomInfoBox = document.getElementById('topBottomInfoBox');
        topBottomInfoBox.innerHTML = infoboxContent;
    }

    function generateSatelliteList(satellites) {
        return `<ul style="padding-left: 20px; list-style-type: none;">
                    ${satellites.map(satellite => `<li>[ID: ${satellite.id}] ${satellite.name}</li>`).join('')}
                </ul>`;
    }

    const rankingsToggle = document.getElementById('rankingsToggle');
    rankingsToggle.addEventListener('click', () => {
        const topBottomInfoBox = document.getElementById('topBottomInfoBox');
        if (topBottomInfoBox) {
            topBottomInfoBox.style.display = topBottomInfoBox.style.display === 'none' ? 'block' : 'none';
        }
    });

    openNav();
});