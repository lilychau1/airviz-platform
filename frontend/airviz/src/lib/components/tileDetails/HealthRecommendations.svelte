<script lang="ts">
    import { onMount } from "svelte";
    import type { HealthRecommendationRecord } from "../../constants";
    import { fetchTileHealthRecommendations } from "../../../api/MockLambdaApi";

    export let tileId: number;

    let recommendations: HealthRecommendationRecord[] = [];

    // Pagination
    let currentPage = 0;
    const cardsPerPage = 3;

    $: recommendationsArray = recommendations && !Array.isArray(recommendations)
        ? Object.entries(recommendations).map(([demographic, recommendation], idx) => ({
            id: idx + 1,
            demographic,
            recommendation
        }))
        : recommendations;

    $: totalPages = Math.ceil((recommendationsArray?.length || 0) / cardsPerPage);

    $: currentCards = (recommendationsArray || []).slice(
        currentPage * cardsPerPage,
        currentPage * cardsPerPage + cardsPerPage
    );

    async function loadRecommendations() {
        try {
            recommendations = await fetchTileHealthRecommendations(tileId);
        } catch (error) {
            console.error("Error loading health recommendations:", error);
        }
    }

    function prevPage() {
        if (currentPage > 0) currentPage -= 1;
    }

    function nextPage() {
        if (currentPage < totalPages - 1) currentPage += 1;
    }

    onMount(() => {
        loadRecommendations();
    });
    </script>

    <div>
    <br>
    <h3>Health Recommendations</h3>
    <div class="health-recommendations-container" role="region" aria-label="Health Recommendations">
        <div
        class="arrow {currentPage === 0 ? 'disabled' : ''}"
        role="button"
        tabindex="0"
        aria-disabled="{currentPage === 0}"
        aria-label="Previous recommendations"
        on:click={prevPage}
        on:keydown={(e) => e.key === "Enter" && prevPage()}
        >
        &#8592;
        </div>

        <div class="health-recommendations-cards">
        {#each currentCards as rec}
            <div class="health-recommendations-card" role="article" aria-label={`Recommendation ${rec.id}`}>
            <div class="health-recommendations-card-number">{rec.id.toString().padStart(2, "0")}</div>
            <div class="health-recommendations-card-demographic">{rec.demographic}</div>
            <div class="health-recommendations-card-text">{rec.recommendation}</div>
            </div>
        {/each}
        </div>

        <div
        class="arrow {currentPage === totalPages - 1 ? 'disabled' : ''}"
        role="button"
        tabindex="0"
        aria-disabled="{currentPage === totalPages - 1}"
        aria-label="Next recommendations"
        on:click={nextPage}
        on:keydown={(e) => e.key === "Enter" && nextPage()}
        >
        &#8594;
        </div>
    </div>

    <div class="page-indicator" aria-label="Page navigation">
        {#each Array(totalPages) as _, idx}
        <div class="dot {idx === currentPage ? 'active' : ''}" aria-current={idx === currentPage ? "page" : undefined}></div>
        {/each}
    </div>
</div>
