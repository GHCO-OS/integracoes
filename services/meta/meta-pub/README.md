# Meta Pub

Camada focada no conteúdo orgânico visível de Facebook e Instagram. O Worker usa uma conexão interna com `meta-ads-actions`, reaproveitando o mesmo Bearer configurado no GPT e sem duplicar secrets da Meta.

- OpenAPI: `https://meta-pub.cuiabar.com/openapi.json`
- Autenticação: API Key no cabeçalho `Authorization`, tipo Bearer.
- Escritas oferecem `validateOnly` quando a operação de origem permite simulação.
- Exclusão geral de mídia publicada no Instagram não é anunciada porque a Instagram Graph API não a oferece de forma geral.

Inclui biblioteca orgânica, publicação, edição, exclusão Facebook, comentários, insights e Instagram Discovery por hashtag.
