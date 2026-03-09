// Função para calcular distância entre dois pontos (Fórmula de Haversine)
export const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Raio da Terra em km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distancia = R * c; // Distância em km
  
  return distancia;
};

const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

// Algoritmo do vizinho mais próximo para otimização de rotas
export const otimizarRota = (pontos) => {
  if (pontos.length < 2) return pontos;
  
  const visitados = [pontos[0]]; // Começa pelo ponto atual (usuário)
  const naoVisitados = pontos.slice(1);
  
  while (naoVisitados.length > 0) {
    const ultimo = visitados[visitados.length - 1];
    
    // Encontrar o ponto não visitado mais próximo
    let menorDistancia = Infinity;
    let indiceMaisProximo = -1;
    
    for (let i = 0; i < naoVisitados.length; i++) {
      const distancia = calcularDistancia(
        ultimo.latitude,
        ultimo.longitude,
        naoVisitados[i].latitude,
        naoVisitados[i].longitude
      );
      
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        indiceMaisProximo = i;
      }
    }
    
    visitados.push(naoVisitados[indiceMaisProximo]);
    naoVisitados.splice(indiceMaisProximo, 1);
  }
  
  return visitados;
};

// Calcular distância total da rota
export const calcularDistanciaTotal = (rota) => {
  let distanciaTotal = 0;
  
  for (let i = 0; i < rota.length - 1; i++) {
    distanciaTotal += calcularDistancia(
      rota[i].latitude,
      rota[i].longitude,
      rota[i + 1].latitude,
      rota[i + 1].longitude
    );
  }
  
  return distanciaTotal;
};

// Estimar tempo de viagem (considerando velocidade média de 40km/h)
export const estimarTempoViagem = (distanciaTotal) => {
  const velocidadeMedia = 40; // km/h
  const tempoHoras = distanciaTotal / velocidadeMedia;
  const tempoMinutos = Math.round(tempoHoras * 60);
  
  const horas = Math.floor(tempoMinutos / 60);
  const minutos = tempoMinutos % 60;
  
  return {
    minutos: tempoMinutos,
    horas,
    minutosRestantes: minutos,
    texto: horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`
  };
};