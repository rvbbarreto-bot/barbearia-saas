export type TenantVertical = 'barbershop' | 'car_wash';

export type VerticalLabels = {
  customer: string;
  service: string;
  professional: string;
  professionals: string;
  appointment: string;
  agenda: string;
  patio: string;
  vehicle: string;
  vehicles: string;
};

export function getVerticalLabels(vertical: TenantVertical): VerticalLabels {
  if (vertical === 'car_wash') {
    return {
      customer: 'Cliente',
      service: 'Serviço',
      professional: 'Box/equipe',
      professionals: 'Boxes/equipes',
      appointment: 'Agendamento',
      agenda: 'Agenda',
      patio: 'Pátio',
      vehicle: 'Veículo',
      vehicles: 'Veículos',
    };
  }
  return {
    customer: 'Cliente',
    service: 'Serviço',
    professional: 'Profissional',
    professionals: 'Profissionais',
    appointment: 'Agendamento',
    agenda: 'Agenda',
    patio: 'Pátio',
    vehicle: 'Veículo',
    vehicles: 'Veículos',
  };
}
