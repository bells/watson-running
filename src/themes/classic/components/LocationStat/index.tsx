import YearStat from '../YearStat';
import PeriodStat from './PeriodStat';
import { RegionExplorer } from '@core/components/RegionExplorer';
import type { GeographySource, RegionSelection } from '@core/types';
import type { Activity } from '../../utils/utils';
interface Props {
  changeYear: (year: string) => void;
  changeTitle: (title: string) => void;
  activities: Activity[];
  source: GeographySource;
  onSourceChange: (source: GeographySource) => void;
  selection: RegionSelection | null;
  onSelect: (selection: RegionSelection | null) => void;
}
export default function LocationStat({
  changeYear,
  changeTitle,
  ...regions
}: Props) {
  return (
    <div className="w-full pb-16">
      <YearStat year="Total" onClick={changeYear} />
      <RegionExplorer {...regions} />
      <PeriodStat onClick={changeTitle} />
    </div>
  );
}
