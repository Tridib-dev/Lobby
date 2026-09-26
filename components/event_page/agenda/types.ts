export type EventAgendaItem = {
    startTime: string;
    endTime: string;
    keynote: string;
};

export type EventAgendaProps = {
    date?: string | Date;
    items: EventAgendaItem[];
    title?: string;
};
