<script lang="ts">
    import LegalPage from '$lib/components/LegalPage.svelte';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<!-- Политика в отношении обработки персональных данных: отдельный документ по
     абзацу третьему пункта 3 статьи 17 Закона № 99-З, по примерной форме НЦЗПД. -->
<LegalPage
    current="pd"
    doc={data.doc}
    version={data.version}
    description="ProtoMap Personal Data Processing Policy"
/>
